// x-scan — verifica promos por X (Twitter) y las registra en promolog_entries.
//
// Equivalente a telegram-scan, pero el "transporte" es Apify (apidojo/tweet-scraper)
// porque X no tiene API gratis ni se puede self-hostear limpio (necesitaría cuentas
// logueadas → límite de granja + ToS; Apify pone las cuentas de su lado).
//
//   1. Lista creadoras con creators.twitter_handle.
//   2. En lotes, corre el actor de Apify (run-sync) con esos handles + filtro de fecha.
//   3. Clasifica cada tweet con HEURÍSTICA (sin IA), regla "Funnel" de Jhon:
//        · señal explícita: link OF/piclink/agregador, menciona OF, o CTA ("link en bio")
//          → mira TEXTO + LINKS EXPANDIDOS (el t.co envuelve el destino real)
//        · si no hay señal pero POSTEÓ foto/video → igual cuenta como promo (en X
//          toda su actividad es funnel al OF de la bio)
//        · solo texto sin nada → No
//   4. Inserta 1 fila por tweet (network="X"). evidence_url = imagen pública del tweet
//      (en X la media NO tiene DRM → se ve la foto real, reusando el render de IG);
//      si no hay imagen, el permalink. notes = texto del tweet. Idempotente por evidence_url.
//
// Auth: X-Cron-Token (cron) o JWT admin/manager. Deployar con --no-verify-jwt.
// SECRETOS: APIFY_TOKEN (ya seteado para IG), CRON_INTERNAL_TOKEN.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";
const APIFY_ACTOR = "apidojo~tweet-scraper";
const HANDLES_PER_RUN = 20; // lote por corrida de Apify (acota tiempo/costo)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};

const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Username pelado, aunque venga como URL (https://x.com/user) o @user — así lee
// también los handles viejos guardados sucios.
const normHandle = (h: string) => {
  let s = (h || "").trim();
  if (/^https?:\/\//i.test(s)) {
    try { s = new URL(s).pathname.split("/").filter(Boolean).pop() || ""; } catch { /* noop */ }
  }
  return s.replace(/^@+/, "").trim().toLowerCase();
};

function ofHandleFromUrl(url: string): string {
  const m = String(url || "").match(/onlyfans\.com\/([A-Za-z0-9_.]+)/i);
  return m ? m[1].toLowerCase() : "";
}

// Señales de promo sobre texto + links expandidos (gratis, sin LLM).
function ofSignals(haystack: string, ofHandle: string): string[] {
  const raw = (haystack || "").toLowerCase();
  const s: string[] = [];
  if (/onlyfans\.com|\bonlyfans\b|\bo\.?f\.?\b/i.test(raw)) s.push("onlyfans");
  if (ofHandle && raw.includes(ofHandle)) s.push("of_handle");
  if (/linktr\.ee|beacons\.ai|allmylinks|hoo\.be|linkr\.bio|fanvue|fansly|fans\.ly|coomer|throne|piclink|campsite\.bio|snipfeed|tap\.bio|justfor\.fans|loyalfans|manyvids|fapello/i.test(raw)) s.push("link_agg");
  if (/(link en bio|link in (my )?bio|ve al link|mira (el|mi) link|mi link|link abajo|abajo (el|mi) link|en el link|mi p[áa]gina|ya fuiste|checa mi|mira mi|te espero en|mi contenido|contenido (exclusivo|completo|nuevo)|suscr[ií]b|\bsub a mi\b|premium|\bvip\b|descuento|oferta|c[óo]mprame|mi of\b|aqu[ií] me lo|sin censura|\+18|18\+)/i.test(raw)) s.push("promo");
  return s;
}

// Media + links expandidos del tweet (el shape de apidojo).
function tweetMedia(it: any): { count: number; firstImage: string | null } {
  let count = 0;
  let firstImage: string | null = null;
  const arr = it?.extendedEntities?.media || it?.entities?.media || it?.media || [];
  if (Array.isArray(arr)) {
    for (const m of arr) {
      count++;
      const u = m?.media_url_https || m?.media_url || m?.thumbnail_url || m?.url;
      if (u && !firstImage) firstImage = String(u);
    }
  }
  return { count, firstImage };
}
function expandedLinks(it: any): string[] {
  const out: string[] = [];
  const urls = it?.entities?.urls || [];
  if (Array.isArray(urls)) for (const u of urls) {
    const e = u?.expanded_url || u?.unwound_url || u?.display_url || u?.url;
    if (e) out.push(String(e));
  }
  const card = it?.card?.url;
  if (card && !/^card:\/\//.test(String(card))) out.push(String(card));
  return out;
}

// Regla Funnel: señal explícita O foto/video → promovió; solo texto → No.
function classifyX(it: any, ofUrl: string): { promoted: boolean; reason: string } {
  const text: string = it?.text || it?.fullText || "";
  const links = expandedLinks(it);
  const { count: media } = tweetMedia(it);
  const sig = ofSignals(text + " " + links.join(" "), ofHandleFromUrl(ofUrl));
  if (sig.length) return { promoted: true, reason: sig.join("+") };
  if (media > 0) return { promoted: true, reason: "media/funnel" };
  return { promoted: false, reason: "solo-texto" };
}

// "Thu Jun 11 06:33:02 +0000 2026" o ISO → Date.
function parseTweetDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

async function runApify(token: string, handles: string[], start: string, maxItems: number): Promise<any[]> {
  const input = { twitterHandles: handles, sort: "Latest", start, maxItems, includeSearchTerms: false };
  const r = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`apify ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN") || "";
  const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN");
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth: cron (X-Cron-Token) o admin/manager (JWT).
  const cronHeader = req.headers.get("x-cron-token");
  const isCron = !!(cronHeader && CRON_TOKEN && cronHeader === CRON_TOKEN);
  if (!isCron) {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
    const ok = (roles || []).some((r: { role: string }) => r.role === "admin" || r.role === "manager");
    if (!ok) return json({ error: "forbidden (admin/manager)" }, 403);
  }
  if (!APIFY_TOKEN) return json({ error: "falta APIFY_TOKEN (secreto de la edge function)" }, 500);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const hours = Number(body.hours) || 30;
  const onlyIds = Array.isArray(body.only_creator_ids) ? body.only_creator_ids as string[] : null;
  const limit = Number(body.limit) || 0; // probar con N creadoras
  const dryRun = body.dry_run === true;
  const start = new Date(Date.now() - hours * 3600 * 1000).toISOString().slice(0, 10);

  let q = sb.from("creators")
    .select("id, name, twitter_handle, onlyfans_url")
    .not("twitter_handle", "is", null).neq("twitter_handle", "");
  if (onlyIds && onlyIds.length) q = q.in("id", onlyIds);
  const { data: creators, error: cErr } = await q;
  if (cErr) return json({ error: cErr.message }, 500);

  let list = creators || [];
  if (limit > 0) list = list.slice(0, limit);

  // Mapa handle→creadora (para asignar cada tweet).
  const byHandle = new Map<string, { id: string; name: string; onlyfans_url: string }>();
  for (const c of list) byHandle.set(normHandle(c.twitter_handle), { id: c.id, name: c.name, onlyfans_url: c.onlyfans_url });

  // 1) Traer tweets en lotes.
  const tweetsByCreator = new Map<string, any[]>(); // creatorId → tweets
  const runStats: unknown[] = [];
  const handles = [...byHandle.keys()];
  for (let i = 0; i < handles.length; i += HANDLES_PER_RUN) {
    const chunk = handles.slice(i, i + HANDLES_PER_RUN);
    try {
      const items = await runApify(APIFY_TOKEN, chunk, start, chunk.length * 10);
      for (const it of items) {
        const uname = normHandle(it?.author?.userName || it?.author?.username || it?.username || "");
        const c = byHandle.get(uname);
        if (!c) continue;
        if (it?.isRetweet || it?.isReply) continue; // solo tweets propios originales
        let arr = tweetsByCreator.get(c.id);
        if (!arr) { arr = []; tweetsByCreator.set(c.id, arr); }
        arr.push(it);
      }
      runStats.push({ chunk: chunk.length, tweets: items.length });
    } catch (e) {
      runStats.push({ chunk: chunk.length, error: String((e as Error)?.message || e) });
    }
  }

  // 2) Clasificar + insertar (1 fila por tweet), idempotente por evidence_url.
  const results: unknown[] = [];
  for (const c of list) {
    const tweets = (tweetsByCreator.get(c.id) || []).sort((a, b) => {
      const da = parseTweetDate(a?.createdAt || a?.created_at)?.getTime() || 0;
      const db = parseTweetDate(b?.createdAt || b?.created_at)?.getTime() || 0;
      return da - db;
    });
    if (!tweets.length) { results.push({ creator: c.name, tweets: 0 }); continue; }

    let inserted = 0, promotedCount = 0, skipped = 0;
    for (let i = 0; i < tweets.length; i++) {
      const it = tweets[i];
      const { promoted, reason } = classifyX(it, c.onlyfans_url);
      if (promoted) promotedCount++;
      const permalink: string = it?.url || it?.twitterUrl || "";
      const { firstImage } = tweetMedia(it);
      const evidence = firstImage || permalink || null;
      if (dryRun) continue;
      if (!evidence) { skipped++; continue; }

      const { data: dupe } = await sb.from("promolog_entries")
        .select("id").eq("creator_id", c.id).eq("network", "X").eq("evidence_url", evidence).limit(1);
      if (dupe && dupe.length) { skipped++; continue; }

      const when = parseTweetDate(it?.createdAt || it?.created_at);
      const { error: insErr } = await sb.from("promolog_entries").insert({
        tenant_id: TENANT_ID,
        creator_id: c.id,
        date: (when || new Date()).toISOString(),
        promoted: promoted ? "true" : "false",
        network: "X",
        platform: promoted ? "OnlyFans" : "Ninguna",
        notes: ((it?.text || it?.fullText || "") as string).slice(0, 2000) || null,
        evidence_url: evidence,
        analyzed_by_ai: true,
        ai_model: "regla-texto-x",
        ai_reasoning: reason,
        story_index: i,
        story_count: tweets.length,
        scraped_at: new Date().toISOString(),
      });
      if (insErr) results.push({ creator: c.name, insertError: insErr.message });
      else inserted++;
    }
    results.push({ creator: c.name, tweets: tweets.length, promoted: promotedCount, inserted, skipped, ...(dryRun ? { dry_run: true } : {}) });
  }

  return json({ ok: true, start, hours, creators: list.length, runStats, results });
});
