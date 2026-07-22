// fb-scan — verifica promos por FACEBOOK y las registra en promolog_entries.
//
// Igual que x-scan pero el transporte es Apify (apify/facebook-posts-scraper).
// FB usa URLs de página/perfil (no handles), y los formatos varían
// (facebook.com/nombre, /profile.php?id=…) → guardamos la URL entera en
// creators.facebook_handle y acá la usamos tal cual (o la construimos si vino
// como username pelado).
//
//   1. Lista creadoras ACTIVAS con facebook_handle.
//   2. Por creadora corre el actor (run-sync) con su URL.  [POR-CREADORA: simple y
//      confiable con la baja adopción actual de FB; si crece mucho hay que pasar a
//      lotes/async — hay un cap defensivo.]
//   3. Clasifica con la MISMA heurística (regla "Funnel" de Jhon): señal explícita
//      (link OF/agregador, menciona OF, CTA) o foto/video → promovió; solo texto → No.
//   4. Inserta 1 fila por post (network="Facebook"); SUBE la foto del post al bucket
//      promolog-evidence (signed URL durable en evidence_url, como IG) y guarda el
//      permalink en story_media_url. Si no hay foto/falla la subida → evidence_url =
//      permalink. Marker "sin-actividad" si no posteó. Idempotente (dedup por permalink
//      en story_media_url, no por evidence_url que ahora cambia cada corrida).
//
// Auth: X-Cron-Token o JWT admin/manager. Deployar con --no-verify-jwt.
// SECRETOS: APIFY_TOKEN, CRON_INTERNAL_TOKEN.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";
const APIFY_ACTOR = "apify~facebook-posts-scraper";
const MAX_CREATORS = 30; // cap defensivo por invocación (FB es por-creadora, run-sync)
const VISION_MODEL = "google/gemini-2.5-flash"; // mismo que el bot de IG (OpenRouter)
const MAX_VISION_PER_RUN = 80; // cap de llamadas de visión por corrida (cuida el costo)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};
const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function ofHandleFromUrl(url: string): string {
  const m = String(url || "").match(/onlyfans\.com\/([A-Za-z0-9_.]+)/i);
  return m ? m[1].toLowerCase() : "";
}

// Señales separadas POR FUERZA (antes iban todas juntas y cualquiera marcaba "sí"):
//  · strong = específicas de OF (link a OF/agregador adulto, mención onlyfans, nick OF) → promo de su funnel sin ambigüedad.
//  · weakOf = CTA con sabor OF/+18 (contenido exclusivo, suscríbete, sin censura, +18) → casi nunca en un ad de marca.
//  · brand  = publicidad de una MARCA/tienda (Shein, Temu, cupón, "publicidad pagada") → NO es su OF.
// Se sacó el CTA genérico de comercio ("link en bio / descuento / oferta / cómprame") como señal que
// promociona POR SÍ SOLA: aparece igual en un ad de Shein que en una promo de OF → generaba falsos
// "sí" (caso real: "cupón de descuento" de Shein marcado como promo de OnlyFans).
function ofSignals(haystack: string, ofHandles: string[]): { strong: string[]; weakOf: string[]; brand: string[] } {
  const raw = (haystack || "").toLowerCase();
  const strong: string[] = [];
  const weakOf: string[] = [];
  const brand: string[] = [];
  // "onlyfans"/"only fans" (+ leet) SIEMPRE; la abreviatura "OF"/"Only" SOLO en posesivo
  // ("mi/tu/su OF", "mi Only") — el "of" INGLÉS daba falsos Sí reales en X ("Fourth Of
  // July") con este mismo regex. Igual fix que telegram-scan #927 y x-scan.
  if (/(?:0|o)nly\s?f[a4]ns|\b(?:mi|tu|su)\s+(?:nuev[oa]\s+)?(?:[o0]\.?f\.?|only)\b/i.test(raw)) strong.push("onlyfans");
  // Cualquier nickname de OF (principal + secundarias) cuenta como señal fuerte.
  if (ofHandles.some((h) => h && raw.includes(h.toLowerCase()))) strong.push("of_handle");
  if (/linktr\.ee|beacons\.ai|allmylinks|hoo\.be|linkr\.bio|fanvue|fansly|fans\.ly|coomer|throne|piclink|campsite\.bio|snipfeed|tap\.bio|justfor\.fans|loyalfans|manyvids|fapello|bybio\.co|stan\.store|linkin\.bio/i.test(raw)) strong.push("link_agg");
  // CTA con sabor OF/+18 (no aparece en un ad de ropa/tienda genérico). "vip" NO suelto
  // (regla del dueño: "evento VIP"/"zona VIP" ≠ OF) → exige contexto de contenido/acceso
  // propio. + suscripci[óo]n (FN real en X: "Mi Only está con 50% en Suscripción").
  if (/(contenido (exclusivo|completo|nuevo|premium|caliente)|suscr[ií]b|suscripci[óo]n|(mi|acceso|contenido)\s+vip\b|sin censura|\+18\b|\b18\+|\bmi of\b|te espero en mi|aqu[ií] me lo dejo)/i.test(raw)) weakOf.push("promo_of");
  // "Checa el primer comentario" / "link en comentarios" = técnica CLÁSICA de FB: el
  // link de OF va en el 1er comentario (FB baja el alcance de posts con link externo).
  // El scraper NO lee comentarios → sin esta regla el post salía "sin-senal-of" y solo
  // la visión lo pescaba a veces (cap MAX_VISION). Caso real: Lina Gallego 01-jul.
  if (/(chec[aá]|mir[aá]|revis[aá]|busc[aá])\w*\s+(el\s+)?primer\s+comentario|link\s+en\s+(el\s+|los\s+)?(primer\s+)?comentario/i.test(raw)) weakOf.push("primer_comentario");
  // Publicidad de MARCA / tienda → NO es promo de su OF (aunque tenga cupón/descuento/CTA).
  if (/\bshein\b|\btemu\b|\baliexpress\b|\bamazon\b|mercado\s?libre|\bcup[óo]n\b|c[óo]digo de descuento|descarga la app|tiendas favoritas|env[íi]o gratis|publicidad\s*pagada|#ad\b|\bsponsored\b|colaboraci[óo]n con|link de compra/i.test(raw)) brand.push("brand_ad");
  return { strong, weakOf, brand };
}

// Texto del post (el shape de apify/facebook-posts-scraper varía → probamos varias claves).
const postText = (it: any): string => it?.text || it?.message || it?.postText || it?.caption || it?.content || "";
const postUrl = (it: any): string => it?.url || it?.postUrl || it?.topLevelUrl || it?.facebookUrl || it?.permalink || "";
const postDate = (it: any): string => it?.time || it?.timestamp || it?.date || it?.publishTime || it?.publishedTime || "";
function postMedia(it: any): { count: number; firstImage: string | null } {
  const urls: string[] = [];
  const media = it?.media || it?.attachments || it?.images || it?.photos || [];
  if (Array.isArray(media)) {
    for (const m of media) {
      // Solo imagen/video real: FB mete un item cuyo "url" es el PERMALINK del post
      // (no una foto) → tomamos image.uri / thumbnail, NO m.url.
      const u = m?.image?.uri || m?.photo_image?.uri || m?.media?.image?.uri || m?.thumbnail || (typeof m === "string" ? m : null);
      if (u) urls.push(String(u));
    }
  }
  if (!urls.length && it?.imageUrl) urls.push(String(it.imageUrl));
  return { count: urls.length || (it?.imageUrl ? 1 : 0), firstImage: urls[0] || null };
}
const postLinks = (it: any): string[] => {
  const out: string[] = [];
  const links = it?.links || it?.externalLinks || it?.urls || [];
  if (Array.isArray(links)) for (const l of links) { const u = typeof l === "string" ? l : (l?.url || l?.link); if (u) out.push(String(u)); }
  if (it?.link) out.push(String(it.link));
  return out;
};

function classifyFb(it: any, ofHandles: string[]): { promoted: boolean; reason: string; brandAd: boolean } {
  // FB ≠ X: en Facebook las creadoras suben contenido personal/normal Y publicidad de
  // marcas (Shein, Temu…). Una foto NO es promo por sí sola. Reglas en orden:
  //  1) Publicidad de marca SIN señal OF fuerte → No (aunque tenga foto o cupón/descuento).
  //  2) Señal OF fuerte (onlyfans / nick OF / agregador adulto) → Sí.
  //  3) CTA con sabor OF/+18 → Sí.
  //  4) Nada de lo anterior → No por texto (si hay foto, decide la visión más abajo).
  const text = postText(it);
  const links = postLinks(it);
  const sig = ofSignals(text + " " + links.join(" "), ofHandles);
  if (sig.brand.length && !sig.strong.length) return { promoted: false, reason: `brand:${sig.brand.join("+")}`, brandAd: true };
  if (sig.strong.length) return { promoted: true, reason: sig.strong.join("+"), brandAd: false };
  if (sig.weakOf.length) return { promoted: true, reason: sig.weakOf.join("+"), brandAd: false };
  return { promoted: false, reason: "sin-senal-of", brandAd: false };
}

// ── Visión: ¿la IMAGEN del post promociona OF? (el promo de FB suele ir quemado
// en el arte: flyer con link, "onlyfans", CTA). SOLO se llama cuando el texto no
// dio señal pero hay imagen → distingue un flyer-promo de una foto personal.
const FB_VISION_PROMPT = `Sos analista de una agencia de OnlyFans. Mirá esta imagen de un post de Facebook de una creadora y decí si el POST PROMOCIONA SU PROPIO OnlyFans (su contenido pago de adultos).
Marcá promoted=true SOLO si hay una señal CLARA de promo a SU contenido pago de adultos: un link a onlyfans/fansly/linktr.ee/beacons/allmylinks/piclink (escrito o visible), la palabra "OnlyFans"/"OF", logo/branding de OF, o un CTA de contenido +18 ("suscríbete a mi contenido exclusivo", "contenido sin censura", "mi VIP").
NO marques promoted=true por: (a) una foto sugerente, selfie o contenido personal/familiar; (b) PUBLICIDAD DE UNA MARCA O TIENDA — Shein, Temu, ropa, maquillaje, un cupón o código de descuento de una tienda, "publicidad pagada", #ad. Un precio o descuento de una TIENDA NO es promo de OnlyFans.
Respondé SOLO JSON: {"promoted": true|false, "reason": "breve"}`;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

const EVIDENCE_BUCKET = "promolog-evidence";

// Descarga los bytes de una imagen (fbcdn) UNA vez para reusarlos en visión Y en la
// subida al bucket (antes se bajaban solo para visión y se descartaban). Best-effort.
async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15000);
    const resp = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    if (!resp.ok) return null;
    const mime = (resp.headers.get("content-type") || "image/jpeg").split(";")[0];
    const bytes = new Uint8Array(await resp.arrayBuffer());
    return { bytes, mime };
  } catch {
    return null;
  }
}

// persistEvidence — sube la foto del post al bucket privado `promolog-evidence` y
// devuelve un signed URL durable (1 año), IGUAL que las stories de IG (promolog-
// webhook). Las URLs fbcdn expiran en horas → subimos la imagen para tener evidencia
// permanente que el popup pueda renderizar. Best-effort: null si falla (el caller cae
// al permalink). Path estable por post (key saneada) + upsert → un re-run sobreescribe.
async function persistEvidence(
  sb: any,
  args: { bytes: Uint8Array; mime: string; creatorId: string; key: string },
): Promise<string | null> {
  try {
    const ext = args.mime.includes("png") ? "png" : args.mime.includes("webp") ? "webp" : "jpg";
    const safe = args.key.replace(/[^A-Za-z0-9]+/g, "_").slice(-80) || "post";
    const path = `${TENANT_ID}/facebook/${args.creatorId}/${safe}.${ext}`;
    const { error } = await sb.storage.from(EVIDENCE_BUCKET).upload(path, args.bytes, { contentType: args.mime, upsert: true });
    if (error) { console.error("fb persistEvidence upload:", error.message); return null; }
    const { data, error: signErr } = await sb.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signErr) { console.error("fb persistEvidence sign:", signErr.message); return null; }
    return data?.signedUrl ?? null;
  } catch (e) {
    console.error("fb persistEvidence error:", (e as Error).message);
    return null;
  }
}

// Visión sobre la imagen del post (recibe el dataUri ya armado, sin re-fetchear).
async function visionIsOfPromo(dataUri: string, apiKey: string, text: string): Promise<{ promoted: boolean; reason: string }> {
  const content = [
    { type: "text", text: text ? `Texto del post: "${text.slice(0, 300)}"\n\n${FB_VISION_PROMPT}` : FB_VISION_PROMPT },
    { type: "image_url", image_url: { url: dataUri } },
  ];
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 30000);
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "HTTP-Referer": "https://maven.asmtech.me", "X-Title": "Maven Promolog FB" },
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

// facebook_handle → URL de FB (acepta URL completa o username pelado).
function fbUrl(handle: string): string {
  const h = (handle || "").trim();
  if (/^https?:\/\//i.test(h)) return h;
  return `https://www.facebook.com/${h.replace(/^@/, "")}`;
}

async function runApify(token: string, url: string, since: string, limit: number): Promise<any[]> {
  const input = { startUrls: [{ url }], resultsLimit: limit, onlyPostsNewerThan: since };
  // Timeout explícito: una llamada colgada de Apify no debe comerse el presupuesto de la
  // edge ni bloquear a las demás creadoras (antes sin timeout → se colgaba el run entero).
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 90_000);
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
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || ""; // visión (igual que IG)
  const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN");
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

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
  if (!APIFY_TOKEN) return json({ error: "falta APIFY_TOKEN" }, 500);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const hours = Number(body.hours) || 24;
  const onlyIds = Array.isArray(body.only_creator_ids) ? body.only_creator_ids as string[] : null;
  const limit = Number(body.limit) || 0;
  const dryRun = body.dry_run === true;
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  let q = sb.from("creators")
    .select("id, name, facebook_handle, onlyfans_url")
    .eq("status", "active") // SOLO activas (igual que IG/X/TG)
    .not("facebook_handle", "is", null).neq("facebook_handle", "");
  if (onlyIds && onlyIds.length) q = q.in("id", onlyIds);
  const { data: creators, error: cErr } = await q;
  if (cErr) return json({ error: cErr.message }, 500);

  let list = creators || [];

  // Rotación JUSTA (anti tail-starvation — mismo fix que x-scan #934, acá es PEOR):
  // fb-scan corre el actor de Apify POR CREADORA (~60-120s c/u) → la edge muere tras
  // ~2 y, sin orden, eran SIEMPRE las mismas 2 (Lina Gallego diaria; 9 de 11 con +3
  // días sin scan). Orden: último scan de facebook ASC → nunca-escaneada primero.
  if (list.length && !(onlyIds && onlyIds.length)) {
    const ids = list.map((c) => c.id);
    const since10 = new Date(Date.now() - 10 * 86400 * 1000).toISOString().slice(0, 10);
    const { data: recent } = await sb.from("promolog_entries")
      .select("creator_id, date")
      .in("creator_id", ids).eq("network", "facebook").eq("analyzed_by_ai", true)
      .gte("date", since10).order("date", { ascending: false });
    const lastByCreator = new Map<string, string>();
    for (const r of (recent ?? []) as Array<{ creator_id: string; date: string }>) {
      if (!lastByCreator.has(r.creator_id)) lastByCreator.set(r.creator_id, r.date);
    }
    list = [...list].sort((a, b) => {
      const da = lastByCreator.get(a.id) || "";
      const db = lastByCreator.get(b.id) || "";
      return da < db ? -1 : da > db ? 1 : 0;
    });
  }
  if (limit > 0) list = list.slice(0, limit);
  const capped = list.length > MAX_CREATORS;
  list = list.slice(0, MAX_CREATORS);

  // Multi-cuenta: nicknames de OF por creadora (principal onlyfans_url + secundarias)
  // → señal of_handle; y cuentas FACEBOOK extra (también se escanean). Una sola query
  // a creator_social_accounts: network in (onlyfans, facebook).
  const ofNicksByCreator = new Map<string, string[]>();
  for (const c of list) { const p = ofHandleFromUrl(c.onlyfans_url); ofNicksByCreator.set(c.id, p ? [p] : []); }
  const fbExtraByCreator = new Map<string, string[]>();
  const creatorIds = list.map((c) => c.id);
  if (creatorIds.length) {
    const { data: extra } = await sb.from("creator_social_accounts")
      .select("creator_id, network, username").in("network", ["onlyfans", "facebook"]).eq("active", true).in("creator_id", creatorIds);
    for (const a of (extra ?? []) as Array<{ creator_id: string; network: string; username: string }>) {
      const u = String(a.username || "").trim();
      if (!u) continue;
      if (a.network === "onlyfans") {
        const nick = u.replace(/^@+/, "").toLowerCase();
        const arr = ofNicksByCreator.get(a.creator_id) ?? [];
        if (nick && !arr.includes(nick)) arr.push(nick);
        ofNicksByCreator.set(a.creator_id, arr);
      } else { // facebook extra → se escanea igual que la principal
        const arr = fbExtraByCreator.get(a.creator_id) ?? [];
        if (!arr.includes(u)) arr.push(u);
        fbExtraByCreator.set(a.creator_id, arr);
      }
    }
  }

  // Targets de escaneo: principal (facebook_handle) + cada cuenta FB extra. Cada
  // target se escanea por separado y la fila lleva source_handle = la cuenta.
  const targets: Array<{ c: (typeof list)[number]; handle: string }> = [];
  for (const c of list) {
    targets.push({ c, handle: c.facebook_handle });
    for (const u of fbExtraByCreator.get(c.id) ?? []) targets.push({ c, handle: u });
  }

  const results: unknown[] = [];
  let rawSample: unknown = null;
  let visionUsed = 0; // cap de costo: total de llamadas de visión en la corrida

  // Procesa UN target (creadora/cuenta FB). Antes el loop era SECUENCIAL (await por
  // creadora ~30s) → la edge se quedaba sin presupuesto y dejaba 5-9 de 10 sin escanear
  // ni marker (se "caían" del scan del día). Ahora corre en olas concurrentes (las MISMAS
  // llamadas a Apify, sin costo extra) para terminar TODAS dentro del budget de la edge.
  const processTarget = async (t: { c: (typeof list)[number]; handle: string }) => {
    const c = t.c;
    const handle = t.handle;
    const items = await runApify(APIFY_TOKEN, fbUrl(handle), since, 15);
    if (dryRun && !rawSample && items[0]) rawSample = { keys: Object.keys(items[0]).slice(0, 40), first: items[0] };

    if (!items.length) {
      if (!dryRun) {
        const { data: ex } = await sb.from("promolog_entries")
          .select("id").eq("creator_id", c.id).eq("network", "facebook").gte("date", today).limit(1);
        if (!ex || !ex.length) {
          await sb.from("promolog_entries").insert({
            tenant_id: TENANT_ID, creator_id: c.id, date: new Date().toISOString(),
            promoted: "false", network: "facebook", platform: "Ninguna",
            notes: null, evidence_url: null,
            analyzed_by_ai: true, ai_model: "regla-texto-fb", ai_reasoning: "sin-actividad",
            scraped_at: new Date().toISOString(),
          });
        }
      }
      return { creator: c.name, posts: 0, marker: true };
    }

    {
      let inserted = 0, promotedCount = 0, skipped = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const permalink = postUrl(it);
        const { firstImage } = postMedia(it);
        // Clave de dedup ESTABLE = permalink del post (la URL de imagen fbcdn cambia en
        // cada scrape por el token oe=). Se guarda en story_media_url.
        const dedupKey = permalink || firstImage || null;
        if (!dedupKey) { skipped++; continue; }

        // Dedup ANTES de gastar visión/subida: si ya tenemos este post, lo saltamos.
        // (las filas viejas se backfillearon story_media_url = su permalink.)
        if (!dryRun) {
          const { data: dupe } = await sb.from("promolog_entries")
            .select("id").eq("creator_id", c.id).eq("network", "facebook").eq("story_media_url", dedupKey).limit(1);
          if (dupe && dupe.length) { skipped++; continue; }
        }

        const cls = classifyFb(it, ofNicksByCreator.get(c.id) ?? []);
        let { promoted, reason } = cls;

        // Bytes de la imagen: se bajan UNA vez y se reusan para visión Y para subir.
        let imgBytes: Uint8Array | null = null;
        let imgMime = "image/jpeg";
        if (firstImage) {
          const f = await fetchImageBytes(firstImage);
          if (f) { imgBytes = f.bytes; imgMime = f.mime; }
        }

        // Visión SOLO si el texto no dio señal, NO es un ad de marca, y hay imagen: el
        // promo de OF puede estar QUEMADO en el arte. El modelo decide (selfie personal
        // o flyer de tienda → No). Los ads de marca se saltan (ya son No firme por texto).
        if (!promoted && !cls.brandAd && OPENROUTER_API_KEY && imgBytes && visionUsed < MAX_VISION_PER_RUN) {
          visionUsed++;
          const v = await visionIsOfPromo(`data:${imgMime};base64,${bytesToBase64(imgBytes)}`, OPENROUTER_API_KEY, postText(it));
          if (v.promoted) { promoted = true; reason = `vision-of:${v.reason}`; }
        }
        if (promoted) promotedCount++;
        if (dryRun) continue;

        // SUBIMOS la foto real al bucket (evidencia durable y renderizable, como IG).
        // Si no hay imagen o falla la subida, evidence_url cae al permalink (link al post).
        let durableUrl: string | null = null;
        if (imgBytes) durableUrl = await persistEvidence(sb, { bytes: imgBytes, mime: imgMime, creatorId: c.id, key: dedupKey });
        const evidence = durableUrl || permalink || firstImage || null;

        const d = postDate(it);
        const when = d ? new Date(d) : null;
        const { error: insErr } = await sb.from("promolog_entries").insert({
          tenant_id: TENANT_ID, creator_id: c.id,
          date: (when && !isNaN(when.getTime()) ? when : new Date()).toISOString(),
          promoted: promoted ? "true" : "false", network: "facebook",
          platform: promoted ? "OnlyFans" : "Ninguna",
          notes: (postText(it) || "").slice(0, 2000) || null,
          evidence_url: evidence,
          story_media_url: dedupKey, // permalink estable: dedup + "Abrir original"
          analyzed_by_ai: true, ai_model: "regla-texto-fb", ai_reasoning: reason,
          source_handle: (handle || "").trim() || null,
          story_index: i, story_count: items.length, scraped_at: new Date().toISOString(),
        });
        if (insErr) results.push({ creator: c.name, insertError: insErr.message });
        else inserted++;
      }
      return { creator: c.name, posts: items.length, promoted: promotedCount, inserted, skipped, ...(dryRun ? { dry_run: true } : {}) };
    }
  };

  // Concurrencia acotada: 5 targets en paralelo por ola → termina TODOS dentro del budget
  // de la edge (vs el loop secuencial que se cortaba a las 1-4 creadoras).
  const FB_CONCURRENCY = 5;
  for (let i = 0; i < targets.length; i += FB_CONCURRENCY) {
    const part = targets.slice(i, i + FB_CONCURRENCY);
    const settled = await Promise.all(part.map((t) =>
      processTarget(t).catch((e) => ({ creator: t.c.name, error: String((e as Error)?.message || e) }))));
    results.push(...settled);
  }

  return json({ ok: true, since, hours, creators: list.length, capped, results, ...(dryRun ? { rawSample } : {}) });
});
