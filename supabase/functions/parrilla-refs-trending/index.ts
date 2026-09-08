// parrilla-refs-trending — reels en tendencia por nicho/género para el bot de
// Managers (pedido de Luis 31/08: "un listado de los reels en tendencia para este
// mes en chicos y chicas"). Alimenta además el banco de referencias de la
// Parrilla (content_grid_refs, source='apify') → F3.
//
// ASÍNCRONO, mismo patrón que promolog-handle-check (el agente tiene 30 s de pared
// y el scrape tarda 1-3 min): dispatch rápido + fila en parrilla_trending_jobs +
// run de Apify (apify/instagram-hashtag-scraper, resultsType=reels) con webhook →
// el callback (?cb=1&job_id=) rankea por reproducciones, guarda las referencias y
// postea el listado al grupo vía whatsapp-send (determinístico, sin LLM).
// profile-analyses-poll re-dispara el callback si el webhook se pierde y aplica
// deadline duro. Claim atómico running→processing: solo un callback publica.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, whatsappCors } from "../_shared/whatsapp.ts";

const APIFY_ACTOR = "apify~instagram-hashtag-scraper";
const MAX_HASHTAGS = 8;
const RESULTS_PER_HASHTAG = 25;
const DEFAULT_CANTIDAD = 10;
const MAX_CANTIDAD = 20;
const DEFAULT_DIAS = 30;

// Hashtags base por género (audiencia hispana). Un nicho conocido suma los suyos;
// uno desconocido entra como hashtag literal. Las managers pueden pasar los suyos.
const HASHTAGS_BASE: Record<string, string[]> = {
  chicas: ["grwm", "outfitdeldia", "fitgirl", "gymgirl", "rutinadegym", "chicasfitness"],
  chicos: ["grwmmen", "modahombre", "gymmotivation", "hombresconestilo", "outfithombre", "estilohombre"],
};
// Referencias para creadoras hispanas: descartamos captions en alfabetos no latinos
// (ruso, árabe, CJK…) — el scrape por hashtag global trae de todo.
const ALFABETO_NO_LATINO = /[Ѐ-ӿ؀-ۿ฀-๿぀-ヿ一-鿿가-힯]/;
const HASHTAGS_NICHO: Record<string, string[]> = {
  fitness: ["fitness", "gymlife", "rutinadegym"],
  gym: ["gymlife", "gymmotivation"],
  humor: ["humor", "comedia", "risas"],
  baile: ["baile", "dancechallenge", "trend"],
  moda: ["outfit", "ootd", "streetwear"],
  maquillaje: ["makeup", "makeuptutorial", "grwm"],
  lifestyle: ["lifestyle", "vlog", "diaenmivida"],
  cocina: ["recetas", "cocina", "foodie"],
  gaming: ["gamer", "gaming", "streamer"],
};

type Genero = "chicas" | "chicos" | "ambos";
interface Params { genero: Genero; nicho: string | null; hashtags: string[]; cantidad: number; dias: number }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...whatsappCors, "Content-Type": "application/json" } });
}
const normTag = (s: string) => String(s ?? "").toLowerCase().replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").trim();

function armarHashtags(genero: Genero, nicho: string | null, propios: string[]): { hashtags: string[]; porGenero: Record<string, string[]> } {
  const porGenero: Record<string, string[]> = {};
  if (propios.length) {
    porGenero[genero] = propios;
  } else {
    const generos = genero === "ambos" ? ["chicas", "chicos"] : [genero];
    const extra = nicho ? (HASHTAGS_NICHO[nicho] ?? [normTag(nicho)]).filter(Boolean) : [];
    for (const g of generos) {
      // Con nicho: 3 del género + los del nicho; sin nicho: los 6 base (o menos si son dos géneros).
      const base = HASHTAGS_BASE[g] ?? [];
      porGenero[g] = extra.length ? [...base.slice(0, 3), ...extra] : base.slice(0, genero === "ambos" ? 4 : 6);
    }
  }
  const all = [...new Set(Object.values(porGenero).flat().map(normTag).filter(Boolean))].slice(0, MAX_HASHTAGS);
  return { hashtags: all, porGenero };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  const reqUrl = new URL(req.url);
  // Callback del webhook de Apify: va ANTES del cron token (Apify no lo manda);
  // auth propia = el runId del payload debe coincidir con el guardado.
  if (reqUrl.searchParams.get("cb") === "1") return await callback(req, reqUrl);

  if (!authorizeCronOrJwt(req)) return json({ ok: false, error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({})) as {
    genero?: string; nicho?: string; hashtags?: string[]; cantidad?: number; dias?: number;
    reply_group_id?: string; requested_by?: string; tenant_id?: string;
  };
  if (!body.reply_group_id) return json({ ok: false, error: "reply_group_id requerido" }, 400);
  return await dispatch(body as typeof body & { reply_group_id: string });
});

async function dispatch(body: { genero?: string; nicho?: string; hashtags?: string[]; cantidad?: number; dias?: number; reply_group_id: string; requested_by?: string; tenant_id?: string }) {
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) return json({ ok: false, error: "APIFY_TOKEN no configurado" }, 500);
  const sb = adminClient();

  const genero: Genero = (["chicas", "chicos", "ambos"].includes(String(body.genero)) ? body.genero : "ambos") as Genero;
  const nicho = String(body.nicho ?? "").trim().toLowerCase() || null;
  const propios = (Array.isArray(body.hashtags) ? body.hashtags : []).map(normTag).filter(Boolean);
  const cantidad = Math.min(MAX_CANTIDAD, Math.max(3, Number(body.cantidad) || DEFAULT_CANTIDAD));
  const dias = Math.min(90, Math.max(7, Number(body.dias) || DEFAULT_DIAS));
  const { hashtags, porGenero } = armarHashtags(genero, nicho, propios);
  if (!hashtags.length) return json({ ok: false, error: "sin_hashtags" }, 400);
  const params: Params & { por_genero: Record<string, string[]> } = { genero, nicho, hashtags, cantidad, dias, por_genero: porGenero };

  const { data: job, error: jobErr } = await sb
    .from("parrilla_trending_jobs")
    .insert({ tenant_id: body.tenant_id ?? null, group_id: body.reply_group_id, requested_by: body.requested_by ?? null, params, status: "pending" })
    .select("id")
    .single();
  if (jobErr || !job) return json({ ok: false, error: `job_insert: ${jobErr?.message}` }, 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const webhooks = [{
    eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
    requestUrl: `${SUPABASE_URL}/functions/v1/parrilla-refs-trending?cb=1&job_id=${job.id}`,
    headersTemplate: JSON.stringify({ Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" }),
    payloadTemplate: JSON.stringify({ runId: "{{resource.id}}", status: "{{resource.status}}", defaultDatasetId: "{{resource.defaultDatasetId}}", job_id: job.id }),
  }];
  // base64url, NO base64 estándar — Apify rechaza el estándar en silencio.
  const webhooksB64 = btoa(JSON.stringify(webhooks)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  let runId: string | null = null;
  let launchErr: string | null = null;
  try {
    const resp = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${token}&webhooks=${webhooksB64}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashtags, resultsType: "reels", resultsLimit: RESULTS_PER_HASHTAG }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) launchErr = `apify_${resp.status}: ${JSON.stringify(data).slice(0, 180)}`;
    else { runId = data?.data?.id ?? null; if (!runId) launchErr = "apify_run_sin_id"; }
  } catch (e) { launchErr = (e as Error).message; }

  if (launchErr) {
    await sb.from("parrilla_trending_jobs").update({ status: "failed", error: launchErr, completed_at: new Date().toISOString() }).eq("id", job.id);
    return json({ ok: false, error: launchErr, job_id: job.id }, 502);
  }
  await sb.from("parrilla_trending_jobs").update({ status: "running", apify_run_id: runId }).eq("id", job.id);
  return json({ ok: true, status: "queued", job_id: job.id, hashtags, genero, nicho, cantidad, eta_seconds: 120 });
}

// ── Callback: rankea, guarda referencias y postea al grupo ─────────────────
async function callback(req: Request, url: URL): Promise<Response> {
  const jobId = url.searchParams.get("job_id");
  if (!jobId) return json({ ok: false, error: "missing_job_id" }, 400);
  const payload = await req.json().catch(() => ({})) as { runId?: string; status?: string; defaultDatasetId?: string };
  const sb = adminClient();

  const { data: job } = await sb
    .from("parrilla_trending_jobs")
    .select("id, status, apify_run_id, group_id, requested_by, params")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return json({ ok: false, error: "job_not_found" }, 404);
  if (job.status === "complete" || job.status === "failed") return json({ ok: true, idempotent: true, status: job.status });
  if (!job.apify_run_id) return json({ ok: false, error: "job_sin_apify_run_id" }, 400);

  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) return json({ ok: false, error: "APIFY_TOKEN no configurado" }, 500);

  const bodyRunId = String(payload.runId ?? "");
  const bodyStatus = String(payload.status ?? "").toUpperCase();
  const bodyDatasetId = String(payload.defaultDatasetId ?? "");
  const hasPlaceholders = [bodyRunId, bodyStatus, bodyDatasetId].some((s) => s.includes("{{"));
  let status: string;
  let datasetId: string | null;
  if (!hasPlaceholders && bodyStatus && bodyRunId === job.apify_run_id) {
    status = bodyStatus; datasetId = bodyDatasetId || null;
  } else {
    const run = await fetchRun(job.apify_run_id, token);
    if ("error" in run) return json({ ok: false, error: `apify_lookup: ${run.error}` }, 502);
    status = String(run.status).toUpperCase(); datasetId = run.defaultDatasetId;
    if (!["SUCCEEDED", "FAILED", "TIMED-OUT", "TIMED_OUT", "ABORTED"].includes(status)) return json({ ok: true, status: "still_running", apify_status: status });
  }

  const { data: claimed } = await sb.from("parrilla_trending_jobs").update({ status: "processing" }).eq("id", jobId).eq("status", "running").select("id");
  if (!claimed?.length) return json({ ok: true, idempotent: true, note: "otro callback ya reclamó este job" });

  const params = (job.params ?? {}) as Params & { por_genero?: Record<string, string[]> };
  const finish = async (st: "complete" | "failed", extra: { result?: unknown; error?: string }) => {
    await sb.from("parrilla_trending_jobs").update({ status: st, result: extra.result ?? null, error: extra.error ?? null, completed_at: new Date().toISOString() }).eq("id", jobId);
  };
  const fallo = async (motivo: string, err: string) => {
    const quien = job.requested_by ? ` ${job.requested_by},` : "";
    const sent = await postToGroup(job.group_id, `⚠️${quien} no pude armar el listado de reels en tendencia — ${motivo}. Pídemelo de nuevo en unos minutos.`);
    await finish("failed", { error: `${err}${sent.ok ? "" : ` · aviso_no_enviado: ${sent.error}`}` });
    return json({ ok: true, status: "failed_notified", send_ok: sent.ok });
  };

  if (status !== "SUCCEEDED" || !datasetId) return await fallo(`el scraper terminó con status ${status}`, `apify_${status}`);
  const items = await fetchDataset(datasetId, token);
  if ("error" in items) return await fallo("no pude leer el resultado del scraper", `dataset: ${items.error}`);

  // ── Ranking: solo videos de los últimos N días, por reproducciones ────────
  const desde = Date.now() - params.dias * 86400_000;
  const porGenero = params.por_genero ?? {};
  const generoDe = (it: any): string => {
    const tags = new Set<string>([...(Array.isArray(it.hashtags) ? it.hashtags : []), ...String(it.caption ?? "").toLowerCase().match(/#[\p{L}\p{N}_]+/gu) ?? []].map(normTag));
    for (const [g, hs] of Object.entries(porGenero)) if (hs.some((h) => tags.has(normTag(h)))) return g;
    return params.genero === "ambos" ? "otros" : params.genero;
  };
  const vistos = new Set<string>();
  const reels = (items.data as any[])
    .filter((it) => it && typeof it.url === "string" && /instagram\.com\/(reel|p)\//.test(it.url))
    .filter((it) => it.type === "Video" || it.productType === "clips" || /\/reel\//.test(it.url))
    .filter((it) => { const t = Date.parse(it.timestamp ?? ""); return !t || t >= desde; })
    .filter((it) => !ALFABETO_NO_LATINO.test(String(it.caption ?? "")))
    .filter((it) => { const u = it.url.replace(/\/$/, ""); if (vistos.has(u)) return false; vistos.add(u); return true; })
    .map((it) => ({
      url: String(it.url).replace(/\/$/, "") + "/",
      plays: Math.max(0, Number(it.videoPlayCount ?? it.videoViewCount ?? it.playsCount ?? 0) || 0),
      // IG devuelve -1 cuando el autor oculta los likes: se trata como desconocido.
      likes: Math.max(0, Number(it.likesCount ?? 0) || 0),
      comments: Math.max(0, Number(it.commentsCount ?? 0) || 0),
      owner: String(it.ownerUsername ?? it.owner?.username ?? "").replace(/^@/, ""),
      caption: String(it.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 90),
      fecha: String(it.timestamp ?? "").slice(0, 10),
      genero: generoDe(it),
    }))
    .sort((a, b) => (b.plays || b.likes) - (a.plays || a.likes));

  const grupos = params.genero === "ambos" ? ["chicas", "chicos"] : [params.genero];
  const porGrupo: Record<string, typeof reels> = {};
  for (const g of grupos) porGrupo[g] = reels.filter((r) => r.genero === g || (r.genero === "otros" && grupos.length === 1)).slice(0, params.cantidad);
  // Con 'ambos', lo que no se pudo atribuir se reparte donde falte.
  if (params.genero === "ambos") {
    const sobrantes = reels.filter((r) => r.genero === "otros");
    for (const g of grupos) while (porGrupo[g].length < params.cantidad && sobrantes.length) porGrupo[g].push(sobrantes.shift()!);
  }
  const total = Object.values(porGrupo).reduce((n, l) => n + l.length, 0);
  if (!total) return await fallo(`el scraper no devolvió reels de los últimos ${params.dias} días para ${params.hashtags.map((h) => "#" + h).join(" ")}`, "sin_reels");

  // ── Banco de referencias (F3): upsert por URL, sin pisar lo manual ─────────
  const refs = Object.entries(porGrupo).flatMap(([g, l]) => l.map((r) => ({
    url: r.url, nicho: params.nicho ? `${g} · ${params.nicho}` : g, source: "apify", active: true,
    notes: `${fmtNum(r.plays)} reproducciones · @${r.owner || "?"} · ${r.fecha}${r.caption ? ` · ${r.caption}` : ""}`,
  })));
  const { error: refErr } = await sb.from("content_grid_refs").upsert(refs, { onConflict: "url", ignoreDuplicates: true });
  if (refErr) console.warn("content_grid_refs upsert:", refErr.message);

  const msg = buildMessage(porGrupo, params, job.requested_by);
  const sent = await postToGroup(job.group_id, msg);
  if (!sent.ok) {
    await finish("failed", { result: { por_grupo: porGrupo }, error: `post_failed: ${sent.error}` });
    return json({ ok: false, error: `post_failed: ${sent.error}` }, 502);
  }
  await finish("complete", { result: { por_grupo: porGrupo, total_scrapeado: items.data.length } });
  return json({ ok: true, status: "complete", total });
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, "") + "k";
  return String(n);
}

function buildMessage(porGrupo: Record<string, Array<{ url: string; plays: number; likes: number; owner: string; caption: string }>>, p: Params, requestedBy: string | null): string {
  const lines: string[] = [];
  const titulo = p.nicho ? `reels en tendencia · ${p.nicho}` : "reels en tendencia";
  lines.push(`🎬 *${titulo[0].toUpperCase()}${titulo.slice(1)}* (últimos ${p.dias} días)${requestedBy ? ` — pedido por ${requestedBy}` : ""}`);
  for (const [g, l] of Object.entries(porGrupo)) {
    if (!l.length) continue;
    lines.push("");
    lines.push(`*${g[0].toUpperCase()}${g.slice(1)}*`);
    l.forEach((r, i) => {
      const stats = [r.plays ? `${fmtNum(r.plays)} repr.` : null, r.likes ? `${fmtNum(r.likes)} likes` : null].filter(Boolean).join(" · ");
      lines.push(`${i + 1}. ${r.url}${stats ? ` — ${stats}` : ""}${r.owner ? ` · @${r.owner}` : ""}`);
      if (r.caption) lines.push(`   _${r.caption}_`);
    });
  }
  lines.push("");
  lines.push(`_Fuente: hashtags ${p.hashtags.map((h) => "#" + h).join(" ")}, ordenados por reproducciones. Quedaron guardados como referencias de la Parrilla._`);
  return lines.join("\n");
}

async function postToGroup(groupId: string, body: string): Promise<{ ok: boolean; error?: string }> {
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

async function fetchRun(runId: string, token: string): Promise<{ status: string; defaultDatasetId: string | null } | { error: string }> {
  try {
    const resp = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
    if (!resp.ok) return { error: `apify_${resp.status}` };
    const data = await resp.json();
    return { status: data?.data?.status ?? "UNKNOWN", defaultDatasetId: data?.data?.defaultDatasetId ?? null };
  } catch (e) { return { error: (e as Error).message }; }
}

async function fetchDataset(datasetId: string, token: string): Promise<{ data: any[] } | { error: string }> {
  try {
    const resp = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&token=${token}`);
    if (!resp.ok) return { error: `apify_${resp.status}` };
    const data = await resp.json();
    return { data: Array.isArray(data) ? data : [] };
  } catch (e) { return { error: (e as Error).message }; }
}
