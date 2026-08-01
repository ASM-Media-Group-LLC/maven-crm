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
import { postKey, MARKER_KEY } from "../_shared/promolog-dedup.ts";

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";
const APIFY_ACTOR = "apidojo~tweet-scraper";
const HANDLES_PER_RUN = 20; // lote por corrida de Apify (acota tiempo/costo)
// Presupuesto por corrida — evita el 504 de plataforma (~150s). Antes x-scan procesaba
// TODAS las creadoras (Apify por lote hasta 120s + visión) → hacía timeout y la cobertura
// quedaba a medias (el comentario de la rotación decía "~13/corrida" pero NUNCA se codeó).
// Ahora: cap de creadoras por corrida + corte por wall-clock, y AUTO-ENCADENADO (la función
// se re-invoca con SOLO las diferidas) para cubrir todo en varias corridas acotadas. Best-
// effort: si el encadenado se cae, la rotación + las crons de repaso convergen igual.
const MAX_CREATORS_PER_RUN = 10;
// Headroom bajo el kill de plataforma (~150s): dejamos ~50s para una creadora ya EN VUELO
// (una llamada de visión ~30s + persist ~15s). Con esto, aunque Apify se coma ~120s, el
// primer chequeo del loop difiere todo y la función devuelve ~122s < 150s (sin 504).
const RUN_BUDGET_MS = 100_000;
const MAX_CHAIN_DEPTH = 8;

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
  // "onlyfans"/"only fans" (+ leet 0nly/f4ns) SIEMPRE. La abreviatura "OF"/"Only" NO se
  // matchea suelta: el "of" INGLÉS está por todos lados en estas cuentas bilingües y
  // generaba FALSOS Sí reales en prod ("Fourth Of July", "dream of me", "cover of...");
  // solo cuenta en posesivo inequívoco ("mi/tu/su OF", "mi Only"). Mismo fix que
  // telegram-scan #927. Un tweet-promo real sin estas palabras igual cae por link_agg,
  // of_handle, CTA o visión (foto sugerente + link = funnel, regla de X).
  // Emoji en el medio permitido (\W{1,4}): "mi 🔥 Only" es fraseo real (red-team).
  if (/(?:0|o)nly\s?f[a4]ns|\b(?:mi|tu|su)\s+(?:\W{1,4}\s*)?(?:nuev[oa]\s+)?(?:[o0]\.?f\.?|only)\b/i.test(raw)) s.push("onlyfans");
  // Cualquiera de sus nicknames de OF (principal + secundarias) cuenta como señal.
  if (ofHandles.some((h) => h && raw.includes(h.toLowerCase()))) s.push("of_handle");
  if (/linktr\.ee|beacons\.ai|allmylinks|hoo\.be|linkr\.bio|fanvue|fansly|fans\.ly|coomer|throne|piclink|campsite\.bio|snipfeed|tap\.bio|justfor\.fans|loyalfans|manyvids|fapello|bybio\.co|stan\.?\s?store|linkin\.bio/i.test(raw)) s.push("link_agg");
  // CTAs de funnel — CONTEXTUALIZADOS tras el red-team 2026-07-22: los sueltos daban FP
  // reales ("zona vip del estadio", "spotify premium", "40% de descuento en el súper",
  // "oferta de trabajo", "¿ya fuiste a votar?", "mira mi tatuaje", "+18 confirmados
  // para la parrillada"). Fuera: premium/vip/descuento/oferta/ya fuiste/checa mi/mira mi
  // pelados. "vip"/"premium" exigen contexto propio; contenido (exclusivo…) tolera un
  // emoji en el medio y conjugaciones (nuevecito). + suscripci[óo]n (FN real "Mi Only
  // 50% en Suscripción"). Un promo real que solo decía "oferta"/"descuento" cae a la
  // VISIÓN (foto sugerente + invitación = funnel de X) — no se pierde, se repesca.
  if (/(link en bio|link in (my )?bio|ve al link|mira (el|mi) link|mi link|link abajo|abajo (el|mi) link|en el link|mi p[áa]gina|(mira|checa|revisa) mi (of|only|link|p[áa]gina|contenido|perfil|vip)|te espero en mi|mi contenido|contenido\s*\W{0,4}\s*(exclusiv|complet|nuev|calient)\w*|contenido premium|suscr[ií]b|suscripci[óo]n|\bsub a mi\b|(mi|tu)\s+vip\b|acceso\s+vip\s+a\s+mi|c[óo]mprame|mi of\b|aqu[ií] me lo|sin censura|\+18\b(?!\s*(confirmad|person|invitad|amig|a[ñn]os))|\b18\+)/i.test(raw)) s.push("promo");
  return s;
}

// Casino / apuestas / trading / "gana dinero" = link de AFILIADO, NO su contenido pago
// (misma regla que telegram-scan #925 y la visión de IG). Red-team: "Regístrate en
// RojaBet…link en bio" y "grupo VIP de señales de trading" salían Sí por el CTA.
function isMoneyMaking(haystack: string): boolean {
  return /casino|apuest|rojabet|1xbet|betplay|bet365|codere|\bstake\b|\btrading\b|se[ñn]ales de (trading|forex)|gana(r|ncias)?\s+(dinero|plata)|dinero (f[áa]cil|extra)|referid|afiliad|trabaj[aá] desde casa|oportunidad de negocio/i.test((haystack || "").toLowerCase());
}

// Destino GRATUITO nombrado (YouTube/Twitch/Spotify/…): "suscríbanse a mi canal de
// youtube" NO es promo de OF — el CTA apunta a una plataforma gratuita explícita.
// Solo aplica sin señal OF fuerte (si además nombra su OF/funnel, la fuerte manda).
function isFreeDest(haystack: string): boolean {
  return /youtube|youtu\.be|\btwitch\b|spotify|soundcloud|apple music|deezer|mercado\s?libre/i.test((haystack || "").toLowerCase());
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

// Publicidad de MARCA/tienda (Shein, Temu, cupón, "publicidad pagada") — un ad pagado a
// un tercero NO es promo de su OF, aunque el CTA genérico ("descuento"/"link") matchee.
function isBrandAd(haystack: string): boolean {
  // Lookbehind: "MI código de descuento PROMO50 y desbloquea mi página" es SU descuento
  // (promo real, red-team) — no publicidad de marca. Ídem "mi wishlist de Amazon" +
  // "contenido exclusivo" (economía de fans, no ad de Amazon).
  return /\bshein\b|\btemu\b|\baliexpress\b|(?<!wishlist de |lista de deseos de )\bamazon\b|mercado\s?libre|\bcup[óo]n\b|(?<!mi )c[óo]digo de descuento|descarga la app|tiendas favoritas|env[íi]o gratis|publicidad\s*pagada|#ad\b|\bsponsored\b|colaboraci[óo]n con|link de compra/i.test((haystack || "").toLowerCase());
}

// Promo SOLO con señal explícita de OF (link/mención/agregador/CTA) — igual que FB
// e IG. Se quitó "cualquier foto = promo": daba falsos positivos (fútbol, marcas,
// memes). Si no hay señal de texto pero hay imagen, la VISIÓN decide (en el loop).
// Excepción: un ad de MARCA sin señal OF fuerte → No firme (no cuenta ni pasa a visión).
function classifyX(it: any, ofHandles: string[]): { promoted: boolean; reason: string; brandAd: boolean } {
  const text: string = it?.text || it?.fullText || "";
  const links = expandedLinks(it);
  const hay = text + " " + links.join(" ");
  const sig = ofSignals(hay, ofHandles);
  const hasStrong = sig.some((x) => x === "onlyfans" || x === "of_handle" || x === "link_agg");
  // Guards (solo sin señal fuerte; brandAd:true además GATEA la visión — un ad de marca,
  // un casino o un CTA hacia YouTube no deben ir a repesca visual):
  if (isBrandAd(hay) && !hasStrong) return { promoted: false, reason: "brand_ad", brandAd: true };
  if (isMoneyMaking(hay) && !hasStrong) return { promoted: false, reason: "money_making", brandAd: true };
  if (hasStrong) return { promoted: true, reason: sig.join("+"), brandAd: false };
  if (isFreeDest(hay)) return { promoted: false, reason: "free_dest", brandAd: true };
  if (sig.length) return { promoted: true, reason: sig.join("+"), brandAd: false };
  return { promoted: false, reason: "sin-senal-of", brandAd: false };
}

// ── Visión: ¿la IMAGEN del tweet promociona OF? Solo se llama si el texto no dio
// señal pero hay imagen → distingue un flyer-promo de una foto/meme/fútbol. Cap
// MAX_VISION para no hacer timeout a volumen de X (las promos reales suelen tener
// el link en el texto, así que la visión es un repesca acotada).
const VISION_MODEL = "google/gemini-2.5-flash";
// 30→60 (2026-07-22): con las corridas livianas (#935 persistir solo promos) hay
// presupuesto para repescar el doble de tweets "mudos de texto pero con foto".
const MAX_VISION_PER_RUN = 60;
const X_VISION_PROMPT = `Sos analista de una agencia de OnlyFans. CÓMO SE PROMOCIONA EN X (Twitter): el link a su OnlyFans/funnel vive en la BIO del perfil, y los posts (selfies, fotos sugerentes, frases coquetas o personales acompañadas de un link) son el ANZUELO para mandar al fan a ese link. Por eso, en X, casi TODO post de la creadora con un link o una invitación APUNTA a su contenido pago — el link suele ser un acortado t.co que redirige a su bio/funnel.
Mirá la imagen + el texto de este post de X de una creadora y decidí si promociona su contenido pago.
promoted=true si se cumple CUALQUIERA:
- se ve a la creadora o una foto sugerente/personal Y el post trae un link (aunque sea acortado t.co) o una invitación a verla/seguirla;
- menciona OnlyFans / su contenido / "link in bio" / suscríbete / precio / descuento;
- se ve un link/handle/logo de una plataforma de pago.
promoted=false SOLO si claramente NO es promo de SU contenido: comentario de fútbol/deportes/noticias SIN foto de ella, un meme genérico, o publicidad de una MARCA/sponsor ajeno. OJO: un casino/apuestas/"gana dinero"/negocio/referido NO es su contenido pago (aunque tenga link) → promoted=false.
Respondé SOLO JSON: {"promoted": true|false, "reason": "breve"}`;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

// persistTweetImage — baja la imagen del tweet y la sube a nuestro bucket privado
// (signed URL durable). Las URL de pbs.twimg.com caducan / bloquean hotlink → no
// renderizaban en la UI (evidencia "fantasma"). Igual patrón que IG. Best-effort:
// si falla devolvemos null y el caller cae a la URL original.
const EVIDENCE_BUCKET = "promolog-evidence";
async function persistTweetImage(sb: any, imageUrl: string, key: string): Promise<string | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15000);
    const resp = await fetch(imageUrl, { signal: ac.signal });
    clearTimeout(t);
    if (!resp.ok) return null;
    const mime = (resp.headers.get("content-type") || "image/jpeg").split(";")[0];
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const safeKey = key.replace(/[^a-zA-Z0-9/_-]/g, "_");
    const path = `${TENANT_ID}/x/${safeKey}.${ext}`;
    const { error } = await sb.storage.from(EVIDENCE_BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
    if (error) return null;
    const { data } = await sb.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
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
  // Timeout explícito: un lote colgado de Apify no debe comerse el presupuesto de la edge
  // (sin esto, un lote lento mataba la corrida ENTERA y se perdían los lotes siguientes →
  // cobertura 8-25/día). Con timeout, el lote falla rápido y los demás siguen.
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 120_000);
  try {
    const r = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: ac.signal,
    });
    if (!r.ok) throw new Error(`apify ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
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
  const handlerStart = Date.now();                       // para el corte por wall-clock (evita 504)
  const chainDepth = Number((body as { _chain_depth?: number })._chain_depth) || 0; // auto-encadenado
  const start = new Date(Date.now() - hours * 3600 * 1000).toISOString().slice(0, 10);

  // ── MODO INGEST (Plan B local) ──────────────────────────────────────────────
  // El scraper LOCAL (Playwright + sesión de X) navega los perfiles y manda acá los
  // tweets YA scrapeados. Reusamos la MISMA clasificación (classifyX + visión) y el
  // MISMO persist que el path de Apify — cero lógica duplicada. NO usa Apify.
  //   body: { mode:"ingest", items:[ { creator_id, source_handle?, tweets:[{text, permalink?, date?, imageUrl?}] } ] }
  if (body.mode === "ingest") {
    const items = Array.isArray(body.items) ? body.items as Array<any> : [];
    if (!items.length) return json({ ok: true, note: "sin items" });
    const ids = [...new Set(items.map((it) => it.creator_id).filter(Boolean))];
    const nicksByCreator = new Map<string, string[]>();
    if (ids.length) {
      const { data: crs } = await sb.from("creators").select("id, onlyfans_url").in("id", ids);
      for (const c of (crs ?? []) as any[]) { const p = ofHandleFromUrl(c.onlyfans_url); nicksByCreator.set(c.id, p ? [p] : []); }
      const { data: extra } = await sb.from("creator_social_accounts").select("creator_id, username").eq("network", "onlyfans").eq("active", true).in("creator_id", ids);
      for (const a of (extra ?? []) as any[]) { const nick = String(a.username || "").replace(/^@+/, "").toLowerCase(); if (!nick) continue; const arr = nicksByCreator.get(a.creator_id) ?? []; if (!arr.includes(nick)) arr.push(nick); nicksByCreator.set(a.creator_id, arr); }
    }
    let vis = 0, inserted = 0, promotedTotal = 0;
    const out: unknown[] = [];
    for (const it of items) {
      const cid = it.creator_id; if (!cid) { out.push({ skip: "sin_creator_id" }); continue; }
      const nicks = nicksByCreator.get(cid) ?? [];
      const tweets: Array<{ text?: string; permalink?: string; date?: string; imageUrl?: string }> = Array.isArray(it.tweets) ? it.tweets : [];
      let ins = 0, promo = 0;
      for (let i = 0; i < tweets.length; i++) {
        const tw = tweets[i];
        // Objeto mínimo que classifyX entiende (lee text/url/createdAt).
        const fake = { text: tw.text || "", url: tw.permalink || "", createdAt: tw.date || "" };
        const clsX = classifyX(fake, nicks);
        let { promoted, reason } = clsX;
        if (!promoted && !clsX.brandAd && OPENROUTER_API_KEY && tw.imageUrl && vis < MAX_VISION_PER_RUN) {
          vis++;
          const v = await visionIsOfPromo(tw.imageUrl, OPENROUTER_API_KEY, tw.text || "");
          if (v.promoted) { promoted = true; reason = `vision-of:${v.reason}`; }
        }
        if (promoted) promo++;
        const dedupKey = tw.permalink || tw.imageUrl || null;
        if (dryRun) continue;
        // Antes: `if (!dedupKey) continue` → el tweet sin link NI SE GUARDABA, y el
        // chequeo de duplicado comparaba `.eq(col, null)`, que en SQL no matchea
        // nunca. Ahora la clave siempre existe (cae al texto o a la fecha) y de la
        // unicidad se ocupa el índice.
        const clave = postKey({ permalink: tw.permalink, text: tw.text, date: tw.date, index: i });
        let evidenceUrl: string = tw.imageUrl || tw.permalink || "";
        if (promoted && tw.imageUrl) { const durable = await persistTweetImage(sb, tw.imageUrl, `${cid}/${i}`); if (durable) evidenceUrl = durable; }
        const when = parseTweetDate(tw.date || "");
        const { error: insErr } = await sb.from("promolog_entries").insert({
          dedup_key: clave,
          tenant_id: TENANT_ID, creator_id: cid, date: (when || new Date()).toISOString(),
          promoted: promoted ? "true" : "false", network: "x",
          platform: promoted ? "OnlyFans" : "Ninguna",
          notes: (tw.text || "").slice(0, 2000) || null, evidence_url: evidenceUrl,
          story_media_url: tw.imageUrl || null, story_link_url: dedupKey,
          analyzed_by_ai: true, ai_model: "regla-texto-x", ai_reasoning: reason,
          source_handle: (it.source_handle || "").replace(/^@+/, "").toLowerCase() || null,
          story_index: i, story_count: tweets.length, scraped_at: new Date().toISOString(),
        });
        if (!insErr) { ins++; inserted++; }
      }
      // Marker "sin actividad" (1/día). El chequeo miraba `date >= hoy-en-UTC`:
      // pasadas las 19:00 de Bogotá eso ya es MAÑANA, no encontraba el marcador del
      // día y lo reinsertaba en cada corrida — de ahí los duplicados de X. Ahora la
      // unicidad la da el índice sobre `dia`, que ya está en hora de Bogotá.
      if (tweets.length === 0 && !dryRun) {
        await sb.from("promolog_entries").insert({ dedup_key: MARKER_KEY, tenant_id: TENANT_ID, creator_id: cid, date: new Date().toISOString(), promoted: "false", network: "x", platform: "Ninguna", analyzed_by_ai: true, ai_model: "regla-texto-x", ai_reasoning: "sin-actividad", scraped_at: new Date().toISOString() });
      }
      promotedTotal += promo;
      out.push({ creator_id: cid, source_handle: it.source_handle, tweets: tweets.length, promoted: promo, inserted: ins });
    }

    // Informe de la corrida (accesible para el bot; ver telegram-scan).
    const noLegibles = Array.isArray(body.unreadable) ? body.unreadable as Array<any> : [];
    // El scraper local postea en TANDAS para que el veredicto (promo sí/no) aparezca
    // mientras corre, en vez de esperar ~9 min al final. `acumulado` trae los totales
    // de las tandas previas y `final` marca la última: el informe se escribe UNA vez.
    const acumulado = (body.acumulado ?? null) as any;
    const esFinal = body.final !== false;
    const conPromo = out.filter((r: any) => r.promoted > 0);
    const sinPromo = out.filter((r: any) => r.promoted === 0 && r.tweets > 0);
    const resumen = {
      red: "x", origen: "agente local",
      perfiles_leidos: out.length + (acumulado?.leidos ?? 0),
      con_promo: conPromo.length + (acumulado?.con_promo ?? 0),
      sin_promo: sinPromo.length + (acumulado?.sin_promo ?? 0),
      leidos_sin_posts: out.filter((r: any) => r.tweets === 0).length + (acumulado?.leidos_sin_posts ?? 0),
      no_legibles: noLegibles.length,
      detalle_con_promo: [...(acumulado?.detalle_con_promo ?? []), ...conPromo.map((r: any) => ({ handle: r.source_handle, promos: r.promoted }))],
      detalle_no_legibles: noLegibles.map((u: any) => ({ handle: u.handle ?? u.source_handle, motivo: u.reason ?? "desconocido" })),
    };
    if (!dryRun && esFinal) {
      await sb.from("promolog_dispatch_runs").insert({
        tenant_id: TENANT_ID, apify_actor_id: "local-agent", status: "succeeded",
        creators_count: items.length + noLegibles.length, creators_succeeded: out.length,
        creators_failed: noLegibles.length, entries_created: inserted,
        payload: { source: "local", network: "x", resumen },
        finished_at: new Date().toISOString(),
      });
    }
    return json({ ok: true, mode: "ingest", source: "local", items: items.length, inserted, promoted: promotedTotal, resumen, ...(dryRun ? { dry_run: true } : {}), results: out });
  }

  // ── MODO TARGETS ────────────────────────────────────────────────────────────
  // Le da al scraper LOCAL la lista de perfiles de X a leer, con el creator_id.
  //   body: { mode:"targets" }
  if (body.mode === "targets") {
    const { data: crs } = await sb.from("creators").select("id, name, artistic_name, twitter_handle").eq("status", "active").not("twitter_handle", "is", null).neq("twitter_handle", "");
    const targets = (crs ?? []).map((c: any) => ({ creator_id: c.id, name: c.artistic_name || c.name, handle: String(c.twitter_handle || "").replace(/^@+/, "") }));
    return json({ ok: true, mode: "targets", count: targets.length, targets });
  }

  let q = sb.from("creators")
    .select("id, name, twitter_handle, onlyfans_url")
    .eq("status", "active") // solo creadoras activas (no escanear bajas/terminated)
    .not("twitter_handle", "is", null).neq("twitter_handle", "");
  if (onlyIds && onlyIds.length) q = q.in("id", onlyIds);
  const { data: creators, error: cErr } = await q;
  if (cErr) return json({ error: cErr.message }, 500);

  let list = creators || [];

  // Rotación JUSTA (anti tail-starvation — mismo problema que IG en #871): cada corrida
  // procesa hasta agotar su presupuesto (~13 creadoras de 34), y sin orden las mismas
  // quedaban siempre primero → la cola (ej. berenaa) pasaba +3 días sin escanear.
  // Ordenamos por ÚLTIMO scan de X ASCENDENTE: nunca-escaneada / más atrasada PRIMERO.
  // Ventana de 10 días acotada para no chocar con el cap de 1000 filas de PostgREST;
  // las creadoras SIN scan en la ventana ordenan como "" = máxima prioridad.
  if (list.length && !(onlyIds && onlyIds.length)) {
    const ids = list.map((c) => c.id);
    const since10 = new Date(Date.now() - 10 * 86400 * 1000).toISOString().slice(0, 10);
    const { data: recent } = await sb.from("promolog_entries")
      .select("creator_id, date")
      .in("creator_id", ids).eq("network", "x").eq("analyzed_by_ai", true)
      .gte("date", since10).order("date", { ascending: false });
    const lastByCreator = new Map<string, string>();
    for (const r of (recent ?? []) as Array<{ creator_id: string; date: string }>) {
      if (!lastByCreator.has(r.creator_id)) lastByCreator.set(r.creator_id, r.date);
    }
    list = [...list].sort((a, b) => {
      const da = lastByCreator.get(a.id) || ""; // "" = sin scan en la ventana → primero
      const db = lastByCreator.get(b.id) || "";
      return da < db ? -1 : da > db ? 1 : 0;
    });
  }
  if (limit > 0) list = list.slice(0, limit);

  // Cap por corrida (evita el 504): procesamos hasta MAX_CREATORS_PER_RUN y DIFERIMOS el
  // resto (la rotación ya puso las más atrasadas primero). No aplica en dry_run ni cuando
  // el caller fijó `limit` (prueba manual). Las diferidas se re-invocan por auto-encadenado.
  let deferred: typeof list = [];
  if (!dryRun && !limit && list.length > MAX_CREATORS_PER_RUN) {
    deferred = list.slice(MAX_CREATORS_PER_RUN);
    list = list.slice(0, MAX_CREATORS_PER_RUN);
  }

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
  // Creadoras cuyo lote de Apify FALLÓ → "no pude leer", NO "no tuiteó". Si no las
  // separáramos, 0 tweets por lote caído se registraba como "sin-actividad" (No falso):
  // exactamente lo que dejó a creadoras que SÍ promocionaban (ej. elizabethloaiza)
  // figurando "sin actividad" en X. Espejo del fix #818 de IG (leer falló → pending).
  const failedCreatorIds = new Set<string>();
  // UN SOLO lote de Apify por corrida: con el cap de creadoras esto casi siempre ya es ≤20
  // handles, pero las cuentas X-extra podrían empujar a un 2do lote (hasta +120s → 504 antes
  // de clasificar). Cortamos a HANDLES_PER_RUN; las creadoras cuyos handles NO entraron (y no
  // tienen otro handle dentro del lote) van a pending — se re-leen por rotación/encadenado.
  const allHandles = [...byHandle.keys()];
  const handles = allHandles.slice(0, HANDLES_PER_RUN);
  if (allHandles.length > handles.length) {
    const fetchedCreatorIds = new Set(handles.map((h) => byHandle.get(h)?.id).filter(Boolean));
    for (const h of allHandles.slice(HANDLES_PER_RUN)) {
      const c = byHandle.get(h);
      if (c && !fetchedCreatorIds.has(c.id)) failedCreatorIds.add(c.id);
    }
  }
  for (let i = 0; i < handles.length; i += HANDLES_PER_RUN) {
    const chunk = handles.slice(i, i + HANDLES_PER_RUN);
    try {
      // Presupuesto por handle: sort "Latest" reparte maxItems entre TODOS los handles del
      // lote → un handle de alto volumen podía comerse el cupo y dejar a otros en 0 (falso
      // "sin actividad"). ×15 (con el filtro `start`=últimas `hours`) da holgura sin volar
      // el costo (casi nadie tuitea >15/día).
      const items = await runApify(APIFY_TOKEN, chunk, start, chunk.length * 15);
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
      // Marcá como "no leída" a TODA creadora con al menos un handle en este lote caído.
      for (const h of chunk) { const c = byHandle.get(h); if (c) failedCreatorIds.add(c.id); }
      runStats.push({ chunk: chunk.length, error: String((e as Error)?.message || e) });
    }
  }

  // 2) Clasificar + insertar (1 fila por tweet), idempotente por evidence_url.
  const results: unknown[] = [];
  let visionUsed = 0; // cap de costo/tiempo: total de llamadas de visión en la corrida
  const timedOut: typeof list = []; // no alcanzadas por el corte de wall-clock → se difieren
  for (let __ci = 0; __ci < list.length; __ci++) {
    const c = list[__ci];
    // Corte por wall-clock: si nos acercamos al kill de plataforma (~150s), dejamos de
    // arrancar creadoras nuevas y diferimos las que quedan (las cubre el auto-encadenado).
    if (Date.now() - handlerStart > RUN_BUDGET_MS) { timedOut.push(...list.slice(__ci)); break; }
    const tweets = (tweetsByCreator.get(c.id) || []).sort((a, b) => {
      const da = parseTweetDate(a?.createdAt || a?.created_at)?.getTime() || 0;
      const db = parseTweetDate(b?.createdAt || b?.created_at)?.getTime() || 0;
      return da - db;
    });
    if (!tweets.length) {
      // Dos casos MUY distintos con 0 tweets:
      //  · lote de Apify caído → NO pudimos leer → pending/"sin datos" (re-intentable),
      //    NUNCA "No" (no afirmamos ausencia de actividad).
      //  · lote OK y sin tweets → "revisada · sin actividad" (promoted='false'): deja
      //    constancia de que SÍ la chequeamos (columna Red Social muestra X en gris).
      // Idempotente: 1 marker por creadora/día (no pisa si ya hay entry de X hoy → si un
      // scan posterior lee bien, sus tweets entran como filas propias y el día recalcula).
      const failed = failedCreatorIds.has(c.id);
      if (!dryRun) {
        {
          // Un marcador por creadora/red/día, garantizado por el índice. El "pending"
          // (lectura fallida) lleva SU propia clave para no pisarse con el "sin
          // actividad": son afirmaciones distintas y no deben colapsar en una.
          await sb.from("promolog_entries").insert(failed ? {
            dedup_key: "x_read_failed",
            tenant_id: TENANT_ID, creator_id: c.id, date: new Date().toISOString(),
            promoted: "pending", network: "x", platform: "Ninguna",
            notes: "[SIN DATOS] No se pudo leer X (Apify falló). NO confirma que no haya tuiteado.",
            evidence_url: null, analyzed_by_ai: false, ai_model: "regla-texto-x",
            ai_reasoning: "Lectura de X fallida (apify): no ausencia confirmada.",
            error_reason: "x_read_failed", needs_review: false, scraped_at: new Date().toISOString(),
          } : {
            dedup_key: MARKER_KEY,
            tenant_id: TENANT_ID, creator_id: c.id, date: new Date().toISOString(),
            promoted: "false", network: "x", platform: "Ninguna",
            notes: null, evidence_url: null,
            analyzed_by_ai: true, ai_model: "regla-texto-x", ai_reasoning: "sin-actividad",
            scraped_at: new Date().toISOString(),
          });
        }
      }
      results.push({ creator: c.name, tweets: 0, marker: failed ? "pending" : "sin-actividad" });
      continue;
    }

    let inserted = 0, promotedCount = 0, skipped = 0;
    // Detalle del path de VISIÓN (solo dry-run): para verificar a mano que un link
    // opaco ya no se marca promo. Cada item = un tweet donde corrió la visión.
    const visionTweets: Array<{ promoted: boolean; reason: string; text: string }> = [];
    for (let i = 0; i < tweets.length; i++) {
      // Corte a mitad de creadora: si el presupuesto se agotó (p.ej. muchas fotos que fueron
      // a visión en serie), paramos de procesar sus tweets restantes. La creadora queda
      // parcial (con lo insertado); el chequeo del loop externo difiere las que siguen.
      if (Date.now() - handlerStart > RUN_BUDGET_MS) break;
      const it = tweets[i];
      const clsX = classifyX(it, ofNicksByCreator.get(c.id) ?? []);
      let { promoted, reason } = clsX;
      const srcHandle = normHandle(it?.author?.userName || it?.author?.username || it?.username || "") || null;
      const permalink: string = it?.url || it?.twitterUrl || "";
      const { firstImage } = tweetMedia(it);
      // Visión SOLO si no hubo señal de texto pero hay imagen (el promo puede estar
      // quemado en el arte). El modelo decide; una foto/meme personal → No.
      if (!promoted && !clsX.brandAd && OPENROUTER_API_KEY && firstImage && visionUsed < MAX_VISION_PER_RUN) {
        visionUsed++;
        const v = await visionIsOfPromo(firstImage, OPENROUTER_API_KEY, it?.text || it?.fullText || "");
        if (dryRun) visionTweets.push({ promoted: v.promoted, reason: v.reason.slice(0, 140), text: ((it?.text || it?.fullText || "") as string).slice(0, 80) });
        if (v.promoted) { promoted = true; reason = `vision-of:${v.reason}`; }
      }
      if (promoted) promotedCount++;
      // Dedup ESTABLE por el PERMALINK del tweet (único e inmutable). La URL de imagen de
      // pbs.twimg.com cambia entre scans → no sirve de clave (duplicaba el mismo tweet).
      const dedupKey = permalink || firstImage || null;
      if (dryRun) continue;
      // La clave ya no puede faltar (cae al texto o a la fecha del tweet), así que
      // un tweet sin link deja de perderse; y la unicidad la impone el índice, no
      // un SELECT previo que además comparaba contra NULL cuando la clave faltaba.
      const clave = postKey({ permalink, text: (it?.text || it?.fullText || "") as string, date: it?.createdAt || it?.created_at, index: i });

      // Evidencia DURABLE: guardamos la imagen en nuestro bucket SOLO para los tweets que
      // SÍ son promo (la evidencia que de verdad importa). Bajar+subir la foto de CADA
      // tweet — incluidos los cientos de "No" — era el grueso del tiempo por corrida
      // (300-400 fotos, una por una) y por eso el scan se cortaba sin cubrir a todas.
      // Los "No" usan la URL original del tweet (se ve mientras Twitter la sirve; si expira
      // no importa, es un "No" sin valor de evidencia). El dedup NO depende de esto (usa el
      // permalink del tweet), así que sigue igual.
      let evidenceUrl: string = firstImage || permalink;
      if (promoted && firstImage) {
        const durable = await persistTweetImage(sb, firstImage, `${c.id}/${String(it?.id || it?.tweetId || i)}`);
        if (durable) evidenceUrl = durable;
      }

      const when = parseTweetDate(it?.createdAt || it?.created_at);
      const { error: insErr } = await sb.from("promolog_entries").insert({
        dedup_key: clave,
        tenant_id: TENANT_ID,
        creator_id: c.id,
        date: (when || new Date()).toISOString(),
        promoted: promoted ? "true" : "false",
        network: "x",
        platform: promoted ? "OnlyFans" : "Ninguna",
        notes: ((it?.text || it?.fullText || "") as string).slice(0, 2000) || null,
        evidence_url: evidenceUrl,
        story_media_url: firstImage || null,
        story_link_url: dedupKey,
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
    results.push({ creator: c.name, tweets: tweets.length, promoted: promotedCount, inserted, skipped, ...(dryRun ? { dry_run: true, visionTweets } : {}) });
  }

  // Auto-encadenado: si quedaron creadoras sin procesar (cap o corte por wall-clock),
  // re-invocamos x-scan con SOLO esas hasta cubrir todo — cada corrida acotada (<150s,
  // sin 504). Best-effort vía EdgeRuntime.waitUntil; si se cae, la rotación + las crons
  // convergen igual. Guard de profundidad para no encadenar infinito.
  const deferredIds = [...deferred.map((c) => c.id), ...timedOut.map((c) => c.id)];
  let chained = false;
  if (deferredIds.length && chainDepth < MAX_CHAIN_DEPTH && CRON_TOKEN && !dryRun) {
    const next = fetch(`${SUPABASE_URL}/functions/v1/x-scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
      body: JSON.stringify({ hours, only_creator_ids: deferredIds, _chain_depth: chainDepth + 1 }),
    }).catch(() => {});
    chained = true;
    try { (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(next); } catch { /* fire-and-forget */ }
  }

  return json({
    ok: true, start, hours,
    creators: list.length, deferred: deferredIds.length, chained, chain_depth: chainDepth,
    runStats, results,
  });
});
