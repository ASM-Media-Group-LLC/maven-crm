import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, whatsappCors } from "../_shared/whatsapp.ts";

// promolog-handle-check — salud de los handles de IG. EFICIENTE: por default solo chequea a
// las creadoras "persistentemente vacías" (get_promolog_stale_creators: activas SIN ninguna
// historia leída en N días, default 7) — NO a las que simplemente no subieron hoy. Resuelve
// cada handle con el actor de PERFIL de Apify y clasifica:
//   - error 'not_found'          → 'broken'     (handle inexistente: renombrado/eliminado/baneado)
//   - error (Restricted/privado) → 'restricted' (EXISTE, no legible sin sesión que la siga)
//   - perfil real                → 'alive'      (existe; simplemente no subió historia)
// Persiste el resultado en promolog_handle_status (upsert con transición roto/resuelto).
//
// Body: { stale_days?=7, handles?:[...] (test, no persiste), mode?:'all', debug?:bool }.
// Deploy --no-verify-jwt. Lo dispara un cron diario (tras el scan de stories).
//
// MODO ASYNC (tool check_ig_handles del bot de WhatsApp):
//   Body { handles:[...], reply_group_id, requested_by? } → crea fila en
//   promolog_handle_check_jobs, lanza el run de Apify con webhook y devuelve
//   'queued' al instante (whatsapp-agent tiene 30s de pared; el scrape tarda ~1min).
//   El webhook vuelve a esta misma función con ?cb=1&job_id=... y ahí se clasifica
//   POR HANDLE, se enriquece con scouter_spammer_accounts (solo lectura) y se postea
//   el resultado al grupo vía whatsapp-send. profile-analyses-poll re-dispara el
//   callback si el webhook se pierde y aplica un deadline duro de 10 min.
//   NO escribe en scouter_leads ni en scouter_spammer_accounts ni en
//   promolog_handle_status: solo en su tabla de jobs.

const APIFY_ACTOR = "apify~instagram-profile-scraper";
const BATCH = 30;
const MAX_ASYNC_HANDLES = 8;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...whatsappCors, "Content-Type": "application/json" } });
}
const norm = (s: string | null | undefined): string =>
  String(s ?? "").toLowerCase().replace(/.*instagram\.com\//i, "").replace(/[@/\s]/g, "").replace(/[/?#].*$/, "").trim();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });

  // ── CALLBACK del webhook de Apify (rama async) ──────────────────────────
  // Va ANTES de authorizeCronOrJwt: el webhook de Apify no manda cron token.
  // Auth propia: el runId del payload tiene que coincidir con el apify_run_id
  // GUARDADO en la fila del job; si viene con placeholders {{...}} (bug conocido
  // del actor) se ignora el body y se consulta la API de Apify con el run id
  // guardado — nunca se procesa con datos del request que no coincidan.
  const reqUrl = new URL(req.url);
  if (reqUrl.searchParams.get("cb") === "1") {
    return await asyncCheckCallback(req, reqUrl);
  }

  if (!authorizeCronOrJwt(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as {
    handles?: string[]; stale_days?: number; mode?: string; debug?: boolean; whoami?: boolean;
    follow_status?: boolean; story_check?: boolean; proxy_test?: boolean;
    reply_group_id?: string; requested_by?: string; tenant_id?: string;
  };

  // ── DISPATCH async (tool check_ig_handles del bot) ──────────────────────
  if (body.reply_group_id && Array.isArray(body.handles)) {
    return await asyncCheckDispatch(body as { handles: string[]; reply_group_id: string; requested_by?: string; tenant_id?: string });
  }

  // whoami: ¿de qué cuenta de IG es la sesión (IG_SESSION_COOKIE)? Devuelve SOLO el
  // user-id + @usuario resuelto — NUNCA el sessionid. Para confirmar que sigues a las
  // creadoras desde la MISMA cuenta que escanea.
  if (body.whoami) {
    const cookie = Deno.env.get("IG_SESSION_COOKIE") ?? "";
    const userId = (decodeURIComponent(cookie).match(/^(\d+)/) ?? [])[1] ?? null;
    let username: string | null = null;
    if (userId) {
      try {
        const resp = await fetch(`https://i.instagram.com/api/v1/users/${userId}/info/`, {
          headers: { "Cookie": `sessionid=${cookie}`, "x-ig-app-id": "936619743392459", "User-Agent": "Instagram 269.0.0.18.75 Android" },
        });
        const j = await resp.json().catch(() => ({}));
        username = j?.user?.username ?? null;
      } catch { /* deja username null */ }
    }
    return json({ ok: true, session_ig_user_id: userId, session_username: username });
  }

  // follow_status: ¿la sesión ya SIGUE a estos handles (aprobado) o el follow está PENDIENTE?
  // Usa web_profile_info con el cookie de la sesión → followed_by_viewer / requested_by_viewer.
  if (body.follow_status && Array.isArray(body.handles)) {
    const cookie = Deno.env.get("IG_SESSION_COOKIE") ?? "";
    const out: unknown[] = [];
    for (const h of body.handles) {
      const uname = norm(h);
      try {
        const resp = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(uname)}`, {
          headers: { "Cookie": `sessionid=${cookie}`, "x-ig-app-id": "936619743392459", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" },
        });
        const j = await resp.json().catch(() => ({})) as any;
        const u = j?.data?.user;
        out.push({ handle: uname, status: resp.status, found: !!u, is_private: u?.is_private ?? null, following: u?.followed_by_viewer ?? null, requested: u?.requested_by_viewer ?? null });
      } catch (e) { out.push({ handle: uname, error: (e as Error).message }); }
    }
    return json({ ok: true, follow_status: out });
  }

  // story_check: prueba DEFINITIVA por creadora, usando la sesión directo contra IG
  // (i.instagram.com, sin actor ni proxy). Resuelve el user-id con el actor de perfil
  // y consulta: friendships/show (¿la sesión la SIGUE / follow pendiente?) + feed story
  // (¿la sesión VE su historia ahora?). Distingue "no la seguimos/pendiente" de "sí la
  // vemos pero el actor/proxy falla" de "no tiene historia". Body: {story_check:true, handles:[...]}.
  if (body.story_check && Array.isArray(body.handles)) {
    const tok = Deno.env.get("APIFY_TOKEN");
    const cookie = Deno.env.get("IG_SESSION_COOKIE") ?? "";
    const igHeaders = { "Cookie": `sessionid=${cookie}`, "x-ig-app-id": "936619743392459", "User-Agent": "Instagram 269.0.0.18.75 Android" };
    const wanted = [...new Set(body.handles.map(norm).filter(Boolean))];
    // 1) resolver user-id de cada handle con el actor de perfil.
    const idByU = new Map<string, string>();
    try {
      const resp = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${tok}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: wanted, resultsType: "details", resultsLimit: 1, proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] } }),
      });
      if (resp.ok) {
        const items = await resp.json().catch(() => []) as any[];
        for (const it of (Array.isArray(items) ? items : [])) {
          const u = norm(it?.username ?? it?.inputUrl ?? it?.url ?? "");
          if (u && it?.id != null) idByU.set(u, String(it.id));
        }
      }
    } catch { /* deja ids vacíos */ }

    const out: unknown[] = [];
    for (const h of wanted) {
      const id = idByU.get(h);
      if (!id) { out.push({ handle: h, error: "no_pude_resolver_id" }); continue; }
      let following: boolean | null = null, outgoing: boolean | null = null, isPrivate: boolean | null = null, followErr: string | null = null;
      try {
        const fr = await fetch(`https://i.instagram.com/api/v1/friendships/show/${id}/`, { headers: igHeaders });
        const fj = await fr.json().catch(() => ({})) as any;
        following = fj?.following ?? null; outgoing = fj?.outgoing_request ?? null; isPrivate = fj?.is_private ?? null;
        if (fj?.message) followErr = String(fj.message);
      } catch (e) { followErr = (e as Error).message; }
      let storyItems: number | null = null, storyErr: string | null = null;
      try {
        const st = await fetch(`https://i.instagram.com/api/v1/feed/user/${id}/story/`, { headers: igHeaders });
        const sj = await st.json().catch(() => ({})) as any;
        if (sj?.message) storyErr = String(sj.message);
        storyItems = sj?.reel?.items?.length ?? 0;
      } catch (e) { storyErr = (e as Error).message; }
      out.push({ handle: h, id, following, outgoing_request: outgoing, is_private: isPrivate, story_items: storyItems, follow_err: followErr, story_err: storyErr });
    }
    return json({ ok: true, story_check: out });
  }

  // proxy_test: ¿el runtime de Supabase Edge puede rutear fetch por el proxy
  // RESIDENCIAL de Apify? Saca la proxy-password de Apify en runtime (users/me;
  // nunca la expone) y prueba salir por residencial (ipify). Si funciona, la
  // lectura directa de historias se puede blindar contra ban (IP residencial +
  // país fijo). Si tira error → Supabase no soporta proxy → hay que mover al gateway.
  if (body.proxy_test) {
    const tok = Deno.env.get("APIFY_TOKEN");
    let proxyPass = "";
    try {
      const me = await fetch(`https://api.apify.com/v2/users/me?token=${tok}`);
      const mj = await me.json().catch(() => ({})) as any;
      proxyPass = mj?.data?.proxy?.password ?? "";
    } catch (e) { return json({ ok: false, step: "users/me", error: (e as Error).message }); }
    if (!proxyPass) return json({ ok: false, error: "sin proxy.password en users/me" });
    const country = Deno.env.get("PROMOLOG_IG_PROXY_COUNTRY") ?? "CO";
    const proxyUrl = `http://groups-RESIDENTIAL,country-${country},session-mvntest:${proxyPass}@proxy.apify.com:8000`;
    // IP de salida SIN proxy (referencia = IP de datacenter de Supabase)
    let directIp: string | null = null;
    try { directIp = (await (await fetch("https://api.ipify.org?format=json")).json())?.ip ?? null; } catch { /* */ }
    try {
      // @ts-ignore — Deno.createHttpClient es unstable; probamos si existe en el runtime
      const client = (Deno as any).createHttpClient?.({ proxy: { url: proxyUrl } });
      if (!client) return json({ ok: false, proxy_supported: false, error: "Deno.createHttpClient no disponible", direct_ip: directIp, hint: "mover lectura al gateway" });
      const r = await fetch("https://api.ipify.org?format=json", { client } as any);
      const j = await r.json().catch(() => ({})) as any;
      return json({ ok: true, proxy_supported: true, country, direct_ip: directIp, proxied_ip: j?.ip ?? null });
    } catch (e) {
      return json({ ok: false, proxy_supported: false, error: (e as Error).message, direct_ip: directIp, hint: "Supabase Edge no rutea por proxy → mover lectura al gateway" });
    }
  }

  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) return json({ ok: false, error: "APIFY_TOKEN no configurado" }, 500);
  const sb = adminClient();
  const staleDays = Number(body.stale_days ?? 7);

  type Row = { creator_id: string | null; name: string | null; handle: string; days_empty: number | null };
  let rows: Row[];
  let persist = true;
  if (Array.isArray(body.handles) && body.handles.length) {
    rows = body.handles.map((h) => ({ creator_id: null, name: null, handle: norm(h), days_empty: null })).filter((r: Row) => r.handle);
    persist = false; // set manual de test → no persiste
  } else if (body.mode === "all") {
    const { data, error } = await sb.from("v_promolog_eligible_creators").select("id, name, instagram_handle");
    if (error) return json({ ok: false, error: error.message }, 500);
    rows = (data ?? []).map((c: any) => ({ creator_id: c.id, name: c.name, handle: norm(c.instagram_handle), days_empty: null })).filter((r) => r.handle);
  } else {
    // DEFAULT: solo las persistentemente vacías (sospechosas de handle roto).
    const { data, error } = await sb.rpc("get_promolog_stale_creators", { p_days: staleDays });
    if (error) return json({ ok: false, error: error.message }, 500);
    rows = (data ?? []).map((c: any) => ({ creator_id: c.creator_id, name: c.name, handle: c.handle, days_empty: c.days_empty })).filter((r: Row) => r.handle);
  }

  const byHandle = new Map<string, Row>();
  for (const r of rows) if (r.handle && !byHandle.has(r.handle)) byHandle.set(r.handle, r);
  const handles = [...byHandle.keys()];
  if (!handles.length) return json({ ok: true, checked: 0, broken: [], note: "sin sospechosas" });

  const statuses: Array<{ row: Row; status: "broken" | "restricted" | "alive"; error: string | null }> = [];
  let inconclusive = 0;

  for (let i = 0; i < handles.length; i += BATCH) {
    const batch = handles.slice(i, i + BATCH);
    let items: any[] = [];
    try {
      const resp = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: batch, resultsType: "details", resultsLimit: 1, proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] } }),
      });
      if (resp.ok) items = await resp.json().catch(() => []);
    } catch { /* cae a inconclusive abajo */ }

    if (body.debug) {
      return json({ ok: true, debug: true, requested: batch, raw_count: Array.isArray(items) ? items.length : 0,
        results: (Array.isArray(items) ? items : []).map((it: any) => ({ u: norm(it?.username ?? it?.inputUrl ?? it?.url ?? ""), e: it?.error ?? (it?.id != null ? "OK" : "?") })) });
    }
    // GUARD: lote entero vacío = run falló → inconcluso, NO marcar rotos.
    if (!Array.isArray(items) || items.length === 0) { inconclusive += batch.length; continue; }

    const byU = new Map<string, any>();
    for (const it of items) { const u = norm(it?.username ?? it?.inputUrl ?? it?.url ?? ""); if (u && !byU.has(u)) byU.set(u, it); }
    for (const h of batch) {
      const it = byU.get(h);
      if (!it) { inconclusive++; continue; }             // sin item → inconcluso
      const r = byHandle.get(h)!;
      if (it.error === "not_found" || it.ig_status === "not_found") statuses.push({ row: r, status: "broken", error: "not_found" });
      else if (it.error) statuses.push({ row: r, status: "restricted", error: String(it.error) });
      else statuses.push({ row: r, status: "alive", error: null });
    }
  }

  // Persistir (solo cuando hay creator_id = modo por-creadora).
  if (persist) {
    for (const s of statuses) {
      if (!s.row.creator_id) continue;
      await sb.rpc("promolog_upsert_handle_status", {
        p_creator_id: s.row.creator_id, p_handle: s.row.handle, p_status: s.status,
        p_error: s.error, p_days: s.row.days_empty,
      });
    }
  }

  const broken = statuses.filter((s) => s.status === "broken").map((s) => ({ handle: s.row.handle, creator: s.row.name, creator_id: s.row.creator_id }));
  return json({
    ok: true, checked: handles.length,
    alive: statuses.filter((s) => s.status === "alive").length,
    restricted: statuses.filter((s) => s.status === "restricted").length,
    broken_count: broken.length, broken, inconclusive, persisted: persist,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODO ASYNC — chequeo pedido por el bot de WhatsApp (tool check_ig_handles)
// ═══════════════════════════════════════════════════════════════════════════

// Lanza el run de Apify con webhook y devuelve 'queued' al toque. La espera
// larga la banca Apify, no un isolate nuestro (EdgeRuntime.waitUntil ya demostró
// perder trabajo en este runtime — ver admin-user-actions).
async function asyncCheckDispatch(
  body: { handles: string[]; reply_group_id: string; requested_by?: string; tenant_id?: string },
): Promise<Response> {
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) return json({ ok: false, error: "APIFY_TOKEN no configurado" }, 500);
  const sb = adminClient();

  const handles = [...new Set(body.handles.map(norm).filter(Boolean))];
  if (!handles.length) return json({ ok: false, error: "sin_handles_validos" }, 400);
  if (handles.length > MAX_ASYNC_HANDLES) {
    return json({ ok: false, error: `max_${MAX_ASYNC_HANDLES}_handles`, recibidos: handles.length }, 400);
  }

  const { data: job, error: jobErr } = await sb
    .from("promolog_handle_check_jobs")
    .insert({
      tenant_id: body.tenant_id ?? null,
      group_id: body.reply_group_id,
      requested_by: body.requested_by ?? null,
      handles,
      status: "pending",
    })
    .select("id")
    .single();
  if (jobErr || !job) return json({ ok: false, error: `job_insert: ${jobErr?.message}` }, 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const webhooks = [{
    eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
    requestUrl: `${SUPABASE_URL}/functions/v1/promolog-handle-check?cb=1&job_id=${job.id}`,
    headersTemplate: JSON.stringify({ Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" }),
    payloadTemplate: JSON.stringify({
      runId: "{{resource.id}}",
      status: "{{resource.status}}",
      defaultDatasetId: "{{resource.defaultDatasetId}}",
      job_id: job.id,
    }),
  }];
  // base64url, NO base64 estándar — Apify rechaza el estándar en silencio.
  const webhooksB64 = btoa(JSON.stringify(webhooks)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  let runId: string | null = null;
  let launchErr: string | null = null;
  try {
    const resp = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${token}&webhooks=${webhooksB64}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernames: handles, resultsType: "details", resultsLimit: 1,
        proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) launchErr = `apify_${resp.status}: ${JSON.stringify(data).slice(0, 180)}`;
    else {
      runId = data?.data?.id ?? null;
      if (!runId) launchErr = "apify_run_sin_id";
    }
  } catch (e) { launchErr = (e as Error).message; }

  if (launchErr) {
    // El fallo de lanzamiento vuelve SINCRÓNICO a la tool: el bot avisa al
    // toque y nadie queda esperando un resultado que nunca va a llegar.
    await sb.from("promolog_handle_check_jobs")
      .update({ status: "failed", error: launchErr, completed_at: new Date().toISOString() })
      .eq("id", job.id);
    return json({ ok: false, error: launchErr, job_id: job.id }, 502);
  }

  await sb.from("promolog_handle_check_jobs")
    .update({ status: "running", apify_run_id: runId })
    .eq("id", job.id);
  return json({ ok: true, status: "queued", job_id: job.id, handles, eta_seconds: 60 });
}

// Callback: clasifica por handle, enriquece con el inventario y postea al grupo.
// Idempotente por claim atómico running→processing (un UPDATE condicional gana,
// el resto ve 0 filas y no publica). Lo puede disparar el webhook de Apify, el
// re-fire de profile-analyses-poll, o un webhook duplicado — solo uno postea.
async function asyncCheckCallback(req: Request, url: URL): Promise<Response> {
  const jobId = url.searchParams.get("job_id");
  if (!jobId) return json({ ok: false, error: "missing_job_id" }, 400);
  const payload = await req.json().catch(() => ({})) as { runId?: string; status?: string; defaultDatasetId?: string };
  const sb = adminClient();

  const { data: job } = await sb
    .from("promolog_handle_check_jobs")
    .select("id, status, apify_run_id, group_id, requested_by, handles")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return json({ ok: false, error: "job_not_found" }, 404);
  if (job.status === "complete" || job.status === "failed") {
    return json({ ok: true, idempotent: true, status: job.status });
  }
  if (!job.apify_run_id) return json({ ok: false, error: "job_sin_apify_run_id" }, 400);

  const apifyToken = Deno.env.get("APIFY_TOKEN");
  if (!apifyToken) return json({ ok: false, error: "APIFY_TOKEN no configurado" }, 500);

  // Confiamos en el body SOLO si el runId coincide con el guardado y no hay
  // placeholders; ante cualquier duda, la fuente de verdad es la API de Apify
  // consultada con el run id GUARDADO (fallback de placeholders, mismo esquema
  // que scrape-profile-deep-callback).
  const bodyRunId = String(payload.runId ?? "");
  const bodyStatus = String(payload.status ?? "").toUpperCase();
  const bodyDatasetId = String(payload.defaultDatasetId ?? "");
  const hasPlaceholders = bodyRunId.includes("{{") || bodyStatus.includes("{{") || bodyDatasetId.includes("{{");
  let status: string;
  let datasetId: string | null;
  if (!hasPlaceholders && bodyStatus && bodyRunId === job.apify_run_id) {
    status = bodyStatus;
    datasetId = bodyDatasetId || null;
  } else {
    const run = await fetchApifyRunHC(job.apify_run_id, apifyToken);
    if ("error" in run) return json({ ok: false, error: `apify_lookup: ${run.error}` }, 502);
    status = String(run.status).toUpperCase();
    datasetId = run.defaultDatasetId;
    const FINAL = ["SUCCEEDED", "FAILED", "TIMED-OUT", "TIMED_OUT", "ABORTED"];
    if (!FINAL.includes(status)) return json({ ok: true, status: "still_running", apify_status: status });
  }

  // ── CLAIM atómico: solo el que transiciona running→processing publica ────
  const { data: claimed } = await sb
    .from("promolog_handle_check_jobs")
    .update({ status: "processing" })
    .eq("id", jobId)
    .eq("status", "running")
    .select("id");
  if (!claimed || claimed.length === 0) {
    return json({ ok: true, idempotent: true, note: "otro callback ya reclamó este job" });
  }

  const handles: string[] = Array.isArray(job.handles) ? job.handles : [];
  const finishJob = async (st: "complete" | "failed", extra: { result?: unknown; error?: string }) => {
    await sb.from("promolog_handle_check_jobs")
      .update({ status: st, result: extra.result ?? null, error: extra.error ?? null, completed_at: new Date().toISOString() })
      .eq("id", jobId);
  };

  // Run que no terminó bien → el grupo se entera del fallo (nunca silencio).
  if (status !== "SUCCEEDED" || !datasetId) {
    const reason = status !== "SUCCEEDED" ? `el scraper terminó con status ${status}` : "el scraper no devolvió datos";
    const sent = await postCheckToGroup(job.group_id, buildCheckFailureMessage(handles, job.requested_by, reason));
    await finishJob("failed", { error: `apify_${status}${sent.ok ? "" : ` · aviso_no_enviado: ${sent.error}`}` });
    return json({ ok: true, status: "failed_notified", send_ok: sent.ok });
  }

  const items = await fetchDatasetHC(datasetId, apifyToken);
  if ("error" in items) {
    const sent = await postCheckToGroup(job.group_id, buildCheckFailureMessage(handles, job.requested_by, "no pude leer el resultado del scraper"));
    await finishJob("failed", { error: `dataset: ${items.error}${sent.ok ? "" : ` · aviso_no_enviado: ${sent.error}`}` });
    return json({ ok: true, status: "failed_notified", send_ok: sent.ok });
  }

  // ── Clasificación POR HANDLE (misma taxonomía que el modo cron) ─────────
  const byU = new Map<string, any>();
  for (const it of items.data) {
    const u = norm(it?.username ?? it?.inputUrl ?? it?.url ?? "");
    if (u && !byU.has(u)) byU.set(u, it);
  }
  const results = handles.map((h) => {
    const it = byU.get(h);
    if (!it) return { handle: h, status: "inconclusive" as const };
    if (it.error === "not_found" || it.ig_status === "not_found") return { handle: h, status: "broken" as const };
    if (it.error) return { handle: h, status: "restricted" as const, error: String(it.error) };
    return {
      handle: h, status: "alive" as const,
      followers: typeof it.followersCount === "number" ? it.followersCount : null,
      is_private: it.private ?? it.isPrivate ?? null,
      is_verified: it.verified ?? null,
    };
  });

  // ── Inventario Maven (SOLO LECTURA de scouter_spammer_accounts) ─────────
  type InvRow = { handle: string; owner: string | null; followers: number | null; is_restricted: boolean | null; active: boolean | null };
  let inventory: InvRow[] = [];
  try {
    const { data: inv } = await sb
      .from("scouter_spammer_accounts")
      .select("instagram_handle, user_id, followers_count, is_restricted, active")
      .in("instagram_handle", handles);
    if (inv?.length) {
      const uids = [...new Set(inv.map((r: any) => r.user_id).filter(Boolean))];
      const ownerById = new Map<string, string>();
      if (uids.length) {
        const { data: profs } = await sb.from("profiles").select("id, full_name").in("id", uids);
        for (const p of profs ?? []) if (p.full_name) ownerById.set(p.id, p.full_name);
      }
      inventory = inv.map((r: any) => ({
        handle: norm(r.instagram_handle),
        owner: r.user_id ? (ownerById.get(r.user_id) ?? null) : null,
        followers: r.followers_count ?? null,
        is_restricted: r.is_restricted ?? null,
        active: r.active ?? null,
      }));
    }
  } catch { /* enriquecimiento best-effort: el chequeo vale sin inventario */ }

  const msg = buildCheckResultMessage(results, inventory, job.requested_by);
  const sent = await postCheckToGroup(job.group_id, msg);
  if (!sent.ok) {
    await finishJob("failed", { result: { results, inventory }, error: `post_failed: ${sent.error}` });
    return json({ ok: false, error: `post_failed: ${sent.error}` }, 502);
  }
  await finishJob("complete", { result: { results, inventory } });
  return json({ ok: true, status: "complete", checked: results.length });
}

function fmtFollowersHC(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function buildCheckResultMessage(
  results: Array<{ handle: string; status: string; followers?: number | null; is_private?: boolean | null; error?: string }>,
  inventory: Array<{ handle: string; owner: string | null; followers: number | null; is_restricted: boolean | null }>,
  requestedBy: string | null,
): string {
  const lines: string[] = [];
  lines.push(`🔎 *Chequeo de cuentas IG*${requestedBy ? ` (pedido por ${requestedBy})` : ""}`);
  lines.push("");
  for (const r of results) {
    if (r.status === "alive") {
      const extra = [
        r.followers != null ? `${fmtFollowersHC(r.followers)} followers` : null,
        r.is_private ? "privada" : null,
      ].filter(Boolean).join(" · ");
      lines.push(`✅ @${r.handle} — activa${extra ? ` · ${extra}` : ""}`);
    } else if (r.status === "broken") {
      lines.push(`🚫 @${r.handle} — no resuelve`);
    } else if (r.status === "restricted") {
      lines.push(`⚠️ @${r.handle} — existe pero no se puede leer (restringida o privada)`);
    } else {
      lines.push(`❓ @${r.handle} — sin dato (blip del scraper; pide reintentar esta)`);
    }
  }
  if (results.some((r) => r.status === "broken")) {
    lines.push("");
    lines.push('_Ojo: "no resuelve" no distingue si la cuenta no existe, fue renombrada o está suspendida — solo que ese handle ya no carga._');
  }
  if (inventory.length) {
    lines.push("");
    lines.push("📋 Registradas en el inventario Maven:");
    for (const i of inventory) {
      const bits = [
        i.owner ? `dueño: ${i.owner}` : "sin dueño asignado",
        i.followers != null ? `${fmtFollowersHC(i.followers)} followers registrados` : null,
        i.is_restricted ? "marcada restringida" : null,
      ].filter(Boolean).join(" · ");
      lines.push(`• @${i.handle} — ${bits}`);
    }
  }
  return lines.join("\n");
}

function buildCheckFailureMessage(handles: string[], requestedBy: string | null, reason: string): string {
  const quien = requestedBy ? ` ${requestedBy},` : "";
  const lista = handles.map((h) => `@${h}`).join(", ");
  return `⚠️${quien} no pude completar el chequeo de ${lista} — ${reason}. Reintenta pidiéndomelo de nuevo en unos minutos.`;
}

async function postCheckToGroup(groupId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const cronToken = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Cron-Token": cronToken },
      body: JSON.stringify({ group_id: groupId, body }),
    });
    const data = await resp.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!resp.ok || data?.ok === false) return { ok: false, error: String(data?.error ?? resp.status) };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

async function fetchApifyRunHC(
  runId: string, token: string,
): Promise<{ status: string; defaultDatasetId: string | null } | { error: string }> {
  try {
    const resp = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
    if (!resp.ok) return { error: `apify_${resp.status}` };
    const data = await resp.json();
    return { status: data?.data?.status ?? "UNKNOWN", defaultDatasetId: data?.data?.defaultDatasetId ?? null };
  } catch (e) { return { error: (e as Error).message }; }
}

async function fetchDatasetHC(datasetId: string, token: string): Promise<{ data: any[] } | { error: string }> {
  try {
    const resp = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&token=${token}`);
    if (!resp.ok) return { error: `apify_${resp.status}` };
    const data = await resp.json();
    return { data: Array.isArray(data) ? data : [] };
  } catch (e) { return { error: (e as Error).message }; }
}
