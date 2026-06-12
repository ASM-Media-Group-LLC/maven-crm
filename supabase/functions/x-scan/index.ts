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
function ofSignals(haystack: string, ofHandles: string[]): string[] {
  const raw = (haystack || "").toLowerCase();
  const s: string[] = [];
  if (/onlyfans\.com|\bonlyfans\b|\bo\.?f\.?\b/i.test(raw)) s.push("onlyfans");
  // Cualquiera de sus nicknames de OF (principal + secundarias) cuenta como señal.
  if (ofHandles.some((h) => h && raw.includes(h.toLowerCase()))) s.push("of_handle");
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

// Promo SOLO con señal explícita de OF (link/mención/agregador/CTA) — igual que FB
// e IG. Se quitó "cualquier foto = promo": daba falsos positivos (fútbol, marcas,
// memes). Si no hay señal de texto pero hay imagen, la VISIÓN decide (en el loop).
function classifyX(it: any, ofHandles: string[]): { promoted: boolean; reason: string } {
  const text: string = it?.text || it?.fullText || "";
  const links = expandedLinks(it);
  const sig = ofSignals(text + " " + links.join(" "), ofHandles);
  if (sig.length) return { promoted: true, reason: sig.join("+") };
  return { promoted: false, reason: "sin-senal-of" };
}

// ── Visión: ¿la IMAGEN del tweet promociona OF? Solo se llama si el texto no dio
// señal pero hay imagen → distingue un flyer-promo de una foto/meme/fútbol. Cap
// MAX_VISION para no hacer timeout a volumen de X (las promos reales suelen tener
// el link en el texto, así que la visión es un repesca acotada).
const VISION_MODEL = "google/gemini-2.5-flash";
const MAX_VISION_PER_RUN = 30;
const X_VISION_PROMPT = `Sos analista de una agencia de OnlyFans. Mirá esta imagen de un post de X (Twitter) de una creadora y decí si el POST PROMOCIONA su OnlyFans.
Marcá promoted=true SOLO si hay una señal CLARA de promo a contenido pago EN la imagen o el texto: link a onlyfans/fansly/linktr.ee/beacons/allmylinks/piclink (escrito o visible), la palabra "OnlyFans"/"OF", logo/branding de OF, o un CTA explícito ("link in bio", "suscríbete", "mi contenido exclusivo", precio/descuento).
NO marques promoted=true por ser una foto sugerente, un meme, fútbol, una marca/sponsor o contenido personal sin esas señales.
Respondé SOLO JSON: {"promoted": true|false, "reason": "breve"}`;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

async function visionIsOfPromo(imageUrl: string, apiKey: string, text: string): Promise<{ promoted: boolean; reason: string }> {
  let dataUri: string;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15000);
    const resp = await fetch(imageUrl, { signal: ac.signal });
    clearTimeout(t);
    if (!resp.ok) return { promoted: false, reason: `img_${resp.status}` };
    const mime = (resp.headers.get("content-type") || "image/jpeg").split(";")[0];
    dataUri = `data:${mime};base64,${bytesToBase64(new Uint8Array(await resp.arrayBuffer()))}`;
  } catch (e) {
    return { promoted: false, reason: `img_fetch:${(e as Error).message}` };
  }
  const content = [
    { type: "text", text: text ? `Texto del tweet: "${text.slice(0, 300)}"\n\n${X_VISION_PROMPT}` : X_VISION_PROMPT },
    { type: "image_url", image_url: { url: dataUri } },
  ];
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 30000);
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "HTTP-Referer": "https://maven.asmtech.me", "X-Title": "Maven Promolog X" },
      body: JSON.stringify({ model: VISION_MODEL, messages: [{ role: "user", content }], response_format: { type: "json_object" }, temperature: 0.1, max_tokens: 300 }),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return { promoted: false, reason: `or_${resp.status}` };
    const raw = ((await resp.json()) as any)?.choices?.[0]?.message?.content ?? "";
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { try { parsed = JSON.parse(String(raw).replace(/```(?:json)?/gi, "").trim()); } catch { /* noop */ } }
    if (!parsed) return { promoted: false, reason: "vision_parse" };
    return { promoted: parsed.promoted === true, reason: String(parsed.reason || "").slice(0, 200) };
  } catch (e) {
    return { promoted: false, reason: `vision:${(e as Error).message}` };
  }
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
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || ""; // visión (igual que IG/FB)
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
  const hours = Number(body.hours) || 24;
  const onlyIds = Array.isArray(body.only_creator_ids) ? body.only_creator_ids as string[] : null;
  const limit = Number(body.limit) || 0; // probar con N creadoras
  const dryRun = body.dry_run === true;
  const start = new Date(Date.now() - hours * 3600 * 1000).toISOString().slice(0, 10);

  let q = sb.from("creators")
    .select("id, name, twitter_handle, onlyfans_url")
    .eq("status", "active") // solo creadoras activas (no escanear bajas/terminated)
    .not("twitter_handle", "is", null).neq("twitter_handle", "");
  if (onlyIds && onlyIds.length) q = q.in("id", onlyIds);
  const { data: creators, error: cErr } = await q;
  if (cErr) return json({ error: cErr.message }, 500);

  let list = creators || [];
  if (limit > 0) list = list.slice(0, limit);

  // Mapa handle→creadora (para asignar cada tweet).
  const byHandle = new Map<string, { id: string; name: string; onlyfans_url: string }>();
  for (const c of list) byHandle.set(normHandle(c.twitter_handle), { id: c.id, name: c.name, onlyfans_url: c.onlyfans_url });

  // Multi-cuenta: nicknames de OF por creadora (principal onlyfans_url + secundarias)
  // y cuentas X EXTRA (también se escanean). creator_social_accounts: network in (x, onlyfans).
  const ofNicksByCreator = new Map<string, string[]>();
  for (const c of list) { const p = ofHandleFromUrl(c.onlyfans_url); ofNicksByCreator.set(c.id, p ? [p] : []); }
  const creatorIds = list.map((c) => c.id);
  if (creatorIds.length) {
    const cById = new Map(list.map((c) => [c.id, c]));
    const { data: extra } = await sb.from("creator_social_accounts")
      .select("creator_id, network, username")
      .in("creator_id", creatorIds).in("network", ["x", "onlyfans"]).eq("active", true);
    for (const a of (extra ?? []) as Array<{ creator_id: string; network: string; username: string }>) {
      const u = String(a.username || "").trim();
      if (!u) continue;
      if (a.network === "onlyfans") {
        const nick = u.replace(/^@+/, "").toLowerCase();
        const arr = ofNicksByCreator.get(a.creator_id) ?? [];
        if (nick && !arr.includes(nick)) arr.push(nick);
        ofNicksByCreator.set(a.creator_id, arr);
      } else { // x extra → se escanea como la principal, mapea a la misma creadora
        const c = cById.get(a.creator_id);
        if (c) byHandle.set(normHandle(u), { id: c.id, name: c.name, onlyfans_url: c.onlyfans_url });
      }
    }
  }

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
  let visionUsed = 0; // cap de costo/tiempo: total de llamadas de visión en la corrida
  for (const c of list) {
    const tweets = (tweetsByCreator.get(c.id) || []).sort((a, b) => {
      const da = parseTweetDate(a?.createdAt || a?.created_at)?.getTime() || 0;
      const db = parseTweetDate(b?.createdAt || b?.created_at)?.getTime() || 0;
      return da - db;
    });
    if (!tweets.length) {
      // Marker "revisada · sin actividad": deja constancia de que SÍ la chequeamos
      // en X hoy (aunque no tuiteó) → la columna Red Social muestra X en gris.
      // Idempotente: 1 marker por creadora/día (no pisa si ya hay entry de X hoy).
      if (!dryRun) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: ex } = await sb.from("promolog_entries")
          .select("id").eq("creator_id", c.id).eq("network", "X").gte("date", today).limit(1);
        if (!ex || !ex.length) {
          await sb.from("promolog_entries").insert({
            tenant_id: TENANT_ID, creator_id: c.id, date: new Date().toISOString(),
            promoted: "false", network: "X", platform: "Ninguna",
            notes: null, evidence_url: null,
            analyzed_by_ai: true, ai_model: "regla-texto-x", ai_reasoning: "sin-actividad",
            scraped_at: new Date().toISOString(),
          });
        }
      }
      results.push({ creator: c.name, tweets: 0, marker: true });
      continue;
    }

    let inserted = 0, promotedCount = 0, skipped = 0;
    for (let i = 0; i < tweets.length; i++) {
      const it = tweets[i];
      let { promoted, reason } = classifyX(it, ofNicksByCreator.get(c.id) ?? []);
      const srcHandle = normHandle(it?.author?.userName || it?.author?.username || it?.username || "") || null;
      const permalink: string = it?.url || it?.twitterUrl || "";
      const { firstImage } = tweetMedia(it);
      // Visión SOLO si no hubo señal de texto pero hay imagen (el promo puede estar
      // quemado en el arte). El modelo decide; una foto/meme personal → No.
      if (!promoted && OPENROUTER_API_KEY && firstImage && visionUsed < MAX_VISION_PER_RUN) {
        visionUsed++;
        const v = await visionIsOfPromo(firstImage, OPENROUTER_API_KEY, it?.text || it?.fullText || "");
        if (v.promoted) { promoted = true; reason = `vision-of:${v.reason}`; }
      }
      if (promoted) promotedCount++;
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
        source_handle: srcHandle,
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
