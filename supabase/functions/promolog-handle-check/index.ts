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

const APIFY_ACTOR = "apify~instagram-profile-scraper";
const BATCH = 30;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...whatsappCors, "Content-Type": "application/json" } });
}
const norm = (s: string | null | undefined): string =>
  String(s ?? "").toLowerCase().replace(/.*instagram\.com\//i, "").replace(/[@/\s]/g, "").replace(/[/?#].*$/, "").trim();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as { handles?: string[]; stale_days?: number; mode?: string; debug?: boolean; whoami?: boolean };

  // whoami: ¿de qué cuenta de IG es la sesión (IG_SESSION_COOKIE)? Devuelve SOLO el
  // user-id + @usuario resuelto — NUNCA el sessionid. Para confirmar que seguís a las
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
    rows = body.handles.map((h) => ({ creator_id: null, name: null, handle: norm(h), days_empty: null })).filter((r) => r.handle);
    persist = false; // set manual de test → no persiste
  } else if (body.mode === "all") {
    const { data, error } = await sb.from("v_promolog_eligible_creators").select("id, name, instagram_handle");
    if (error) return json({ ok: false, error: error.message }, 500);
    rows = (data ?? []).map((c: any) => ({ creator_id: c.id, name: c.name, handle: norm(c.instagram_handle), days_empty: null })).filter((r) => r.handle);
  } else {
    // DEFAULT: solo las persistentemente vacías (sospechosas de handle roto).
    const { data, error } = await sb.rpc("get_promolog_stale_creators", { p_days: staleDays });
    if (error) return json({ ok: false, error: error.message }, 500);
    rows = (data ?? []).map((c: any) => ({ creator_id: c.creator_id, name: c.name, handle: c.handle, days_empty: c.days_empty })).filter((r) => r.handle);
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
