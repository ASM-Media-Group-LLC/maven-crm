// promolog-analyze.ts — análisis con IA de historias de Instagram + escritura de
// entries. Extraído del webhook de Apify para ser la ÚNICA fuente de verdad,
// reutilizable por la lectura directa (`promolog-story-read`). NO tiene efectos
// de top-level (no Deno.serve) → se puede importar sin arrancar un server.
//
// Entrada: una lista de "story items" ya normalizados (ver StoryItem) + metadata
// de la creadora. Salida: inserta 1 promolog_entry por historia (o 1 "No/sin
// historia" / "sin datos" cuando corresponde) y devuelve el conteo.

import { classifyLinkDestination, isShortener } from "./link-classifier.ts";

export const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";
export const LLM_MODEL = Deno.env.get("PROMOLOG_LLM_MODEL") ?? "google/gemini-2.5-flash";
const LLM_TIMEOUT_MS = 30_000;
export const MAX_STORIES_PER_CREATOR = 10;
export const CONCURRENCY = 5;
const VIDEO_REANALYZE_THRESHOLD = 0.7;
const NEEDS_REVIEW_THRESHOLD = 0.6;
const EVIDENCE_BUCKET = "promolog-evidence";

// StoryItem — forma NORMALIZADA de una historia, agnóstica de la fuente. Tanto la
// lectura directa de IG como (potencialmente) un dataset de Apify se mapean a esto.
export interface StoryItem {
  type: "image" | "video";
  mediaUrl: string | null;   // imagen (o thumbnail del video) para Vision
  videoUrl: string | null;   // video completo para re-análisis nivel 2
  caption: string | null;
  linkUrl: string | null;    // sticker de link (destino)
  timestamp: string | null;  // hora real de posteo (ISO)
  pk?: string | null;        // id estable de la historia en IG (dedup entre re-runs)
}

export interface StoryAnalysis {
  promoted: boolean;
  promotion_type: "direct" | "indirect" | "none";
  has_buy_link: boolean;
  buy_link_type: string | null;
  platform_mentioned: string;
  confidence: number;
  reasoning: string;
}

export interface CreatorCtx {
  creatorId: string;
  sourceHandle: string;
  ofNicks: string[];
  knownPlatform: string | null;
  knownFunnelHosts: string[];
  name?: string | null; // nombre/artístico — para matchear su dominio funnel propio
}

export interface RunCtx {
  dispatchRunId: string;
  apifyRunId: string | null;
  scanDate: string;
  openrouterKey: string;
}

const VISION_PROMPT = `Analizá esta story de Instagram de una creadora de contenido para una agencia de OnlyFans.

Tu job: decidir si en ESTA story la creadora está PROMOCIONANDO su contenido pago (OnlyFans / Piclink / Fansly / etc), o no.

REGLA CENTRAL: "promocionar" = hay un PUNTERO o LLAMADO A LA ACCIÓN concreto hacia contenido PAGO. Que la foto sea sexy o sugestiva NO es promoción por sí sola — una creadora puede postear lencería/bikini sin promocionar nada. Lo que define la promoción es que DIRIJA al fan a comprar/ver contenido pago (un link, un sticker, una mención de su plataforma, o una invitación clara). NO infieras promoción solo de la apariencia (ropa, pose, cuerpo).

Tres categorías:
1) DIRECTA (promotion_type="direct", promoted=true, has_buy_link=true): hay un LINK o puntero VISIBLE a contenido pago — sticker/URL de OnlyFans/Piclink/Fansly/Linktree, "link in bio", swipe-up, o un watermark/overlay con una URL de plataforma de pago (ej. "onlyfans.com/nick") o con un nick JUNTO a la palabra/logo de la plataforma (ej. "OF: @nick"). TAMBIÉN cuenta como DIRECTA un link/sticker/CTA a SU PROPIO TELEGRAM como embudo (ej. sticker o texto "t.me/sunick", "mi Telegram", "únete a mi canal", "detrás de cámara → link"): en IG está prohibido linkear OnlyFans directo, así que muchas usan su canal de Telegram de puente hacia el contenido pago → mandar a su propio Telegram SÍ es promoción. (OJO: esto es en INSTAGRAM. NO confundir con la regla de que, DENTRO de Telegram, promocionar el canal VIP no cuenta — son cosas distintas.)
2) INDIRECTA (promotion_type="indirect", promoted=true): NO hay link visible, pero el TEXTO tiene un llamado a la acción claro hacia contenido pago: "escríbeme por mi contenido", "más en mi página / mi OF", "contenido exclusivo / VIP / premium", "suscribite", "DM para el link", o una invitación EXPLÍCITA por TEXTO a ir a su cuenta "premium/+18" (esas palabras — o 🔞 / "cuenta de adultos/explícita" — tienen que estar escritas). Tiene que haber una INVITACIÓN a ir a otro lado o comprar — NO alcanza con una foto linda + un emoji, NI con un simple @tag/mención a otra cuenta de IG: un @ suelto NO es "redirección a una cuenta premium/+18" salvo que el texto traiga esas palabras al lado (ver la regla de @MENCIÓN en la GUÍA).
3) NO PROMUEVE (promotion_type="none", promoted=false): TODO lo demás. Incluye EXPLÍCITAMENTE las fotos sugestivas (lencería, bikini, cuerpo destacado, poses insinuantes) que NO tienen ningún link, mención de plataforma ni llamado a la acción a contenido pago. También lifestyle, selfies, gym, comida, viajes, etc. Estar sexy NO es promocionar. ⚠️ Y también: un CTA genérico tipo "VIDEO COMPLETO AQUÍ" / "CONTEXTO COMPLETO AQUÍ" / "míralo completo" que claramente apunta a contenido NO-adulto — un show, comedia, un evento, un vlog, un canal de YouTube/Twitch, una entrevista — NO es promo de contenido pago aunque tenga sticker de link: es promoción de su contenido GRATUITO (caso real: creadora de comedia con "VIDEO COMPLETO AQUÍ" de su show → NO). Solo cuenta como INDIRECTA/DIRECTA si el contexto es de contenido pago (+18/sugerente) o nombra plataforma de pago.

Devolvé SOLO JSON con esta forma:
{
  "promoted": true | false,                       // true SOLO si direct o indirect
  "promotion_type": "direct" | "indirect" | "none",
  "has_buy_link": true | false,                   // true SOLO si hay link/sticker/URL VISIBLE a contenido pago
  "buy_link_type": "onlyfans" | "piclink" | "linktree" | "fansly" | "other" | null,
  "platform_mentioned": "onlyfans" | "piclink" | "fansly" | "linktree" | "ninguna",  // solo si se nombra o se ve; si no, "ninguna"
  "confidence": 0.0 a 1.0,
  "reasoning": "una oración corta en español: QUÉ señal de promoción viste (link/sticker/frase CTA) o, si no promociona, por qué no"
}

GUÍA:
- Necesitás una señal CONCRETA para marcar promoted=true: un link/sticker/URL, una mención de su plataforma de pago, o una frase de llamado a la acción. Sin eso → "none".
- ⚠️ DISTINCIÓN CLAVE — "ganar dinero" NO es promoción de su contenido: un CTA a GANAR PLATA / hacer dinero / "gana aquí" / "ganancias de $X diarios" / oportunidad / negocio / referido / afiliado / trabajá desde casa apunta a que el FAN gane dinero (reclutamiento/afiliados), NO a comprar el contenido pago de ELLA. Eso es promoted=false, promotion_type="none" (aunque haya un link/sticker visible), SALVO que ADEMÁS haya señal real de su contenido (su nick de OnlyFans, "mi contenido / suscribite / VIP / contenido exclusivo / +18"). Promocionar = vender SU contenido, no ofrecer una forma de ganar plata.
- Si platform_mentioned="ninguna" Y has_buy_link=false Y el texto no tiene ningún CTA → promoted=false (none). NO la marques "indirect" solo por verse sugerente.
- Los emojis (🍑🔥💦😈🥵) por sí solos NO son promoción; solo cuentan si acompañan un CTA real.
- ⚠️ WATERMARK/FIRMA ≠ PROMO: las creadoras firman sus fotos/stories con su @usuario de Instagram como marca de agua. Un @handle suelto (watermark/overlay/sticker de mención) NO es promoción por sí solo, SALVO que se cumpla alguna: (a) al lado trae la palabra OnlyFans/OF, su logo, o una URL de plataforma de pago; (b) ES uno de los NICKNAMES DE ONLYFANS listados abajo Y ese bloque de abajo te dice EXPRESAMENTE que ese nick cuenta suelto (los nicks que son iguales a su @ de Instagram NO cuentan sueltos). Casos que NUNCA son promo por sí solos: su PROPIO @ de Instagram como firma; y un handle atribuido a OTRA red ("Twitter @x", "X @x", "TikTok @x", "Telegram @x") → apunta a esa red, NO a contenido pago → promoted=false. Ante la duda de si un @handle suelto es su nick de OF o su firma de IG → promoted=false. Manda lo que diga el bloque de NICKNAMES de abajo sobre esta GUÍA.
- ⚠️ @MENCIÓN/TAG A OTRA CUENTA DE INSTAGRAM ≠ PROMO: taggear o mencionar a OTRA cuenta de IG (una amiga, una colaboración, un gym, otra creadora, una marca) NO es promocionar SU contenido pago → promoted=false, promotion_type="none". DOS excepciones en las que SÍ cuenta: (a) la mención trae al lado un CTA/puntero a contenido PAGO (cualquiera de los de DIRECTA o INDIRECTA: OnlyFans/OF/premium/VIP/"suscribite"/+18, "mi contenido / mi página / mi OF", "DM para el link", o una URL de plataforma de pago); (b) ese @ es uno de los NICKNAMES DE ONLYFANS listados abajo que cuentan sueltos, o es SU PROPIO nick de OF como watermark (eso NO es "otra cuenta") — en esos casos MANDA ese bloque de abajo, NO esta regla. Fuera de esas dos, una story de lifestyle/gym/foto con un @tag y texto motivacional, SIN link/CTA y que NO es su nick de OF, es "none" — NO la marques promoted=true ni platform_mentioned="onlyfans" solo porque haya un @ a otra cuenta.
- En "reasoning" citá la señal concreta ("sticker 'OF' arriba a la derecha", "caption: 'link en bio'") o, si no promociona, decilo ("solo una selfie en lencería, sin link ni CTA").
- Si la imagen está borrosa o el texto ilegible y NO podés saber si hay un link/CTA, poné confidence < 0.6 para revisión manual — pero NO marques promoted=true por las dudas: marcá lo que efectivamente ves.`;

export function funnelHost(u: string | null | undefined): string {
  const s = String(u ?? "").trim();
  if (!s) return "";
  try {
    return new URL(s.match(/^https?:\/\//i) ? s : "https://" + s)
      .hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function ofNickFromUrl(url: string): string {
  let s = (url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) {
    try { s = new URL(s).pathname.split("/").filter(Boolean)[0] ?? ""; } catch { return ""; }
  }
  return s.replace(/^@+/, "").toLowerCase().trim();
}

// Compara nick vs @ de IG despojando separadores (puntos/guiones/underscore): así
// "anadevin13" (nick de OF crudo de la URL) y "ana.devin13" (@ de IG con punto) se
// reconocen como EL MISMO nombre → ambiguo. Sin esto, una variante de puntuación del
// mismo nombre caía como "fuerte" y reactivaba el FP de firma de IG (caso Anadevinvip).
const bareName = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function ofNicksClause(nicks: string[], igHandle = ""): string {
  const clean = [...new Set((nicks || []).filter(Boolean).map((n) => n.toLowerCase()))];
  if (!clean.length) return "";
  const ig = normalizeHandle(igHandle);
  const igBare = bareName(ig);
  // Un nick de OF que ADEMÁS es el @ de IG escaneado es ambiguo: como watermark suelto
  // es la firma normal de IG (elizabethloaiza puso su @ en todas las fotos y NO era
  // promo). Solo los nicks DISTINTOS del @ de IG cuentan "a secas"; los iguales exigen
  // contexto de plataforma de pago al lado. Match por nombre pelado (sin puntuación).
  const strong = clean.filter((n) => bareName(n) !== igBare);
  const ambiguous = clean.filter((n) => bareName(n) === igBare);
  // El encabezado lista SOLO los nicks fuertes como "los que cuentan sueltos" (la GUÍA
  // los exceptúa); los ambiguos se nombran aparte con su propia advertencia. Así el
  // carve-out "salvo que esté en la lista" del prompt no licencia la firma de IG.
  let out = `\n\nNICKNAMES DE ONLYFANS DE ESTA CREADORA: ${clean.map((n) => `@${n}`).join(", ")}. La cuenta de Instagram escaneada es @${ig || "desconocida"}.`;
  if (strong.length) {
    out += `\nSi ves ${strong.map((n) => `@${n}`).join(" o ")} EXACTO en la imagen/video (watermark, overlay, sticker, texto sobreimpreso) o en el caption, contá eso como un PUNTERO a contenido pago aunque NO haya link clickeable: poné has_buy_link=true, buy_link_type="onlyfans", platform_mentioned="onlyfans", promoted=true, promotion_type="direct", y citá el nick visto en "reasoning". DOS excepciones: (1) NO lo infieras de que la foto se parece a ella, tiene que ser el NICK como texto/watermark visible; (2) si el nick aparece atribuido EXPLÍCITAMENTE a otra red (ej. "Twitter ${strong.map((n) => `@${n}`)[0]}", "TikTok …"), apunta a esa red, NO a OF → promoted=false.`;
  }
  if (ambiguous.length) {
    out += `\n⚠️ ${ambiguous.map((n) => `@${n}`).join(", ")} es TAMBIÉN su @ de Instagram: si aparece suelto como watermark/firma NO cuenta como promo (es la firma normal de IG). Solo contalo si aparece CON contexto de plataforma de pago al lado: la palabra "OnlyFans"/"OF", su logo, una URL (onlyfans.com/…), o un CTA a contenido pago.`;
  }
  return out;
}

export function normalizeHandle(h: string): string {
  const raw = String(h).trim().replace(/^@/, "");
  const urlMatch = raw.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  return raw.replace(/\/$/, "").toLowerCase();
}

// ¿El link (dominio desconocido) es el funnel PROPIO de la creadora? Regla del owner:
// un link que contiene su @/nick de OF o su nombre = promo a OF (las modelos no pueden
// linkear OF directo en IG → usan página propia: bybio.co/bysaritac, mariajose.co…).
// ⚠️ Match por SEGMENTOS alfanuméricos (host labels + partes del path), NUNCA contra el
// URL concatenado: "shop.com/ariadna" fusionado sería "shopcomariadna" y matchearía
// "maria" en falso (borde .com↔path). Reglas anti-falso-positivo:
//  · IDENTIDAD (handle IG + nicks de OF): son slugs distintivos → substring dentro de
//    cualquier segmento (host o path). "saritac" ⊆ "bysaritac" ✓. Tokens de 4 chars
//    exigen segmento EXACTO (un nick corto genérico no debe pescar /california).
//  · NOMBRE real (más colisionable: maria/laura/…): solo contra segmentos del HOST y
//    con ≥5 chars → "mariajose.co" cuenta; "/maria-collection" en un afiliado NO.
export function matchesCreatorFunnel(
  decoded: string | null | undefined,
  host: string | null | undefined,
  handle: string | null | undefined,
  ofNicks: string[] = [],
  name?: string | null,
): boolean {
  const norm = (t: string) => (t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const segs = String(decoded || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const hostSegs = String(host || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const idTokens = [handle, ...(ofNicks ?? [])].map(norm).filter((t) => t.length >= 4);
  const nameTokens = String(name || "").split(/\s+/).map(norm).filter((t) => t.length >= 5);
  const idHit = idTokens.some((t) =>
    segs.some((s) => (t.length >= 5 ? s.includes(t) : s === t)));
  const nameHit = nameTokens.some((t) => hostSegs.some((s) => s.includes(t)));
  return idHit || nameHit;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// deno-lint-ignore no-explicit-any
function parseModelJson(text: string): any | null {
  // deno-lint-ignore no-explicit-any
  const tryParse = (s: string): any | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  };
  let v = tryParse(text);
  if (v) return v;
  const noFences = text.replace(/```(?:json)?/gi, "").trim();
  v = tryParse(noFences);
  if (v) return v;
  const first = noFences.indexOf("{");
  const last = noFences.lastIndexOf("}");
  if (first !== -1 && last > first) {
    v = tryParse(noFences.slice(first, last + 1));
    if (v) return v;
  }
  // 4º intento — RESCATE de respuesta PARCIAL/truncada: Gemini a veces corta el JSON
  // (thinking se come el presupuesto de tokens) y queda inválido, PERO los campos clave
  // van al inicio y están completos. Los sacamos por regex en vez de tirar todo a "revisar".
  const grab = (re: RegExp): string | null => { const m = noFences.match(re); return m ? m[1] : null; };
  const prom = grab(/"promoted"\s*:\s*(true|false)/i);
  if (prom !== null) {
    return {
      promoted: prom === "true",
      promotion_type: grab(/"promotion_type"\s*:\s*"(direct|indirect|none)"/i) ?? (prom === "true" ? "direct" : "none"),
      has_buy_link: /"has_buy_link"\s*:\s*true/i.test(noFences),
      buy_link_type: grab(/"buy_link_type"\s*:\s*"([^"]*)"/i),
      platform_mentioned: grab(/"platform_mentioned"\s*:\s*"([^"]*)"/i) ?? "ninguna",
      confidence: Number(grab(/"confidence"\s*:\s*([0-9.]+)/i) ?? "0.75"),
      reasoning: (grab(/"reasoning"\s*:\s*"([^"]*)"/i) ?? "veredicto recuperado de respuesta parcial de la IA").slice(0, 500),
    };
  }
  return null;
}

// Reintento ÚNICO para fallas NO-determinísticas del modelo/red (JSON truncado/ilegible,
// respuesta vacía, timeout, 429/5xx): un segundo intento resuelve la gran mayoría.
// Caso real 2026-07-22 (EnnidWong): 1 story con json_parse → el día entero quedó ⏳.
// Errores firmes (4xx de imagen, key inválida) NO se reintentan.
async function callOpenRouter(
  content: unknown[],
  apiKey: string,
): Promise<{ analysis: StoryAnalysis } | { error: string }> {
  const first = await callOpenRouterOnce(content, apiKey);
  if (!("error" in first)) return first;
  if (/^(json_parse|openrouter_empty|openrouter_call|openrouter_429|openrouter_5\d\d)/.test(first.error)) {
    return await callOpenRouterOnce(content, apiKey);
  }
  return first;
}

async function callOpenRouterOnce(
  content: unknown[],
  apiKey: string,
): Promise<{ analysis: StoryAnalysis } | { error: string }> {
  const body = {
    model: LLM_MODEL,
    messages: [{ role: "user", content }],
    response_format: { type: "json_object" },
    temperature: 0.1,
    // 8192 (era 2048): Gemini 2.5 Flash usa "thinking" que consume del presupuesto de
    // tokens → con 2048 truncaba el JSON de salida → json_parse fail → todo a "revisar".
    max_tokens: 8192,
  };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://maven.asmtech.me",
        "X-Title": "Maven Promolog",
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return { error: `openrouter_${resp.status}: ${(await resp.text()).slice(0, 200)}` };
    const data = await resp.json() as any;
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) return { error: "openrouter_empty" };
    const parsed = parseModelJson(text);
    if (!parsed) return { error: `json_parse :: ${text.slice(0, 200)}` };
    return {
      analysis: {
        promoted: parsed.promoted === true,
        promotion_type: ["direct", "indirect", "none"].includes(parsed.promotion_type)
          ? parsed.promotion_type : "none",
        has_buy_link: parsed.has_buy_link === true,
        buy_link_type: parsed.buy_link_type ?? null,
        platform_mentioned: String(parsed.platform_mentioned ?? "ninguna").toLowerCase(),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
        reasoning: String(parsed.reasoning ?? "").slice(0, 500),
      },
    };
  } catch (e) {
    clearTimeout(t);
    return { error: `openrouter_call: ${(e as Error).message}` };
  }
}

async function analyzeImageStory(
  imageUrl: string,
  caption: string | null,
  apiKey: string,
  ofNicks: string[] = [],
  igHandle = "",
): Promise<
  | { analysis: StoryAnalysis; imageBytes: Uint8Array; mime: string }
  | { error: string; imageBytes?: Uint8Array; mime?: string }
> {
  let imageBytes: Uint8Array;
  let mime = "image/jpeg";
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15_000);
    const resp = await fetch(imageUrl, { signal: ac.signal });
    clearTimeout(t);
    if (!resp.ok) return { error: `image_${resp.status}` };
    const ct = resp.headers.get("content-type");
    if (ct) mime = ct.split(";")[0].trim();
    imageBytes = new Uint8Array(await resp.arrayBuffer());
  } catch (e) {
    return { error: `image_fetch: ${(e as Error).message}` };
  }
  const dataUri = `data:${mime};base64,${bytesToBase64(imageBytes)}`;
  const promptText = VISION_PROMPT + ofNicksClause(ofNicks, igHandle);
  const content = [
    { type: "text", text: caption ? `Caption de la story: "${caption}"\n\n${promptText}` : promptText },
    { type: "image_url", image_url: { url: dataUri } },
  ];
  const result = await callOpenRouter(content, apiKey);
  if ("error" in result) return { error: result.error, imageBytes, mime };
  return { analysis: result.analysis, imageBytes, mime };
}

async function analyzeVideoStory(
  videoUrl: string,
  caption: string | null,
  apiKey: string,
  ofNicks: string[] = [],
  igHandle = "",
): Promise<{ analysis: StoryAnalysis } | { error: string }> {
  const promptText = VISION_PROMPT + ofNicksClause(ofNicks, igHandle);
  const content = [
    { type: "text", text: caption ? `Caption de la story: "${caption}"\n\n${promptText}` : promptText },
    { type: "video_url", video_url: { url: videoUrl } },
  ];
  return callOpenRouter(content, apiKey);
}

// Ventana de dedup: dos corridas dentro de este lapso se consideran "el mismo día de
// escaneo". IG expira las historias en 24h; 20h cubre "otro run 10h después" sin pisar
// el día siguiente. Ojo: la columna `date` es un TIMESTAMP por-corrida y `network` se
// guarda en minúscula ('instagram'), así que dedup va por `created_at` + ilike.
const DEDUP_WINDOW_MS = 20 * 60 * 60 * 1000;
const dedupSince = () => new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

// ¿La creadora ya tiene ALGUNA entry de IG reciente? Se usa para que un re-run no agregue
// una fila "sin historias"/"sin datos" cuando ya hay registros de este mismo día.
async function creatorHasInstagramEntry(sb: any, creatorId: string): Promise<boolean> {
  const { data } = await sb.from("promolog_entries").select("id")
    .eq("creator_id", creatorId).ilike("network", "instagram")
    .gte("created_at", dedupSince()).limit(1);
  return !!(data && data.length);
}

async function persistEvidence(
  sb: any,
  args: { bytes: Uint8Array; mime: string; creatorId: string; key: string },
): Promise<string | null> {
  try {
    const ext = args.mime.includes("png") ? "png" : args.mime.includes("webp") ? "webp" : "jpg";
    // Path ESTABLE por (creadora, historia) — NO por run. Así un re-run del mismo día
    // pisa la misma imagen (upsert) en vez de acumular una copia por cada corrida.
    const safeKey = args.key.replace(/[^a-zA-Z0-9_-]/g, "") || "0";
    const path = `${TENANT_ID}/${args.creatorId}/${safeKey}.${ext}`;
    const { error } = await sb.storage.from(EVIDENCE_BUCKET).upload(path, args.bytes, {
      contentType: args.mime, upsert: true,
    });
    if (error) { console.error("persistEvidence upload failed:", error.message); return null; }
    const { data, error: signErr } = await sb.storage
      .from(EVIDENCE_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signErr) { console.error("persistEvidence sign failed:", signErr.message); return null; }
    return data?.signedUrl ?? null;
  } catch (e) {
    console.error("persistEvidence error:", (e as Error).message);
    return null;
  }
}

async function insertAnalyzedEntry(
  sb: any,
  args: {
    creator_id: string; dispatch_run_id: string; apify_run_id: string | null;
    story_index: number; story_count: number; media_url: string; evidence_url: string;
    scraped_at: string | null; scan_date: string; analysis: StoryAnalysis;
    analysis_level?: string; needs_review?: boolean; story_link_url?: string | null;
    is_video?: boolean; source_handle?: string; known_platform?: string | null;
    story_pk?: string | null;
  },
): Promise<boolean> {
  const platformMap: Record<string, string> = {
    onlyfans: "onlyfans", piclink: "onlyfans", fansly: "fansly", linktree: "linktree", ninguna: "Ninguna",
  };
  let platform = platformMap[args.analysis.platform_mentioned] ?? "Ninguna";
  let platformInferred = false;
  if (args.analysis.promoted && platform === "Ninguna" && args.known_platform) {
    platform = args.known_platform; platformInferred = true;
  }
  const notesPrefix = args.needs_review ? "[REVISAR MANUAL] " : "[AUTO] ";
  const levelTag = args.analysis_level ? ` · ${args.analysis_level}` : "";
  const videoTag = args.is_video ? " · video" : "";
  const inferredTag = platformInferred ? ` · plataforma inferida (${platform})` : "";
  const notes = `${notesPrefix}${args.analysis.reasoning} (confidence: ${args.analysis.confidence.toFixed(2)}${levelTag}${videoTag}${inferredTag})`;
  const { error } = await sb.from("promolog_entries").insert({
    tenant_id: TENANT_ID, creator_id: args.creator_id, date: args.scan_date,
    promoted: args.analysis.promoted ? "true" : "false", network: "Instagram", platform,
    has_buy_link: args.analysis.has_buy_link, buy_link_type: args.analysis.buy_link_type,
    notes, evidence_url: args.evidence_url, dispatch_run_id: args.dispatch_run_id,
    apify_run_id: args.apify_run_id, analyzed_by_ai: true, ai_model: LLM_MODEL,
    ai_confidence: args.analysis.confidence, ai_reasoning: args.analysis.reasoning,
    story_index: args.story_index, story_count: args.story_count, story_media_url: args.media_url,
    story_link_url: args.story_link_url ?? null, scraped_at: args.scraped_at,
    source_handle: args.source_handle ?? null, needs_review: args.needs_review ?? false,
    story_pk: args.story_pk ?? null,
  });
  if (error) { console.error("insert entry failed:", error.message); return false; }
  return true;
}

async function insertUnreadableEntry(
  sb: any,
  args: {
    creator_id: string; dispatch_run_id: string; apify_run_id: string | null;
    story_index: number; story_count: number; media_url: string; evidence_url: string;
    scraped_at: string | null; scan_date: string; reason: string; is_video?: boolean;
    story_pk?: string | null;
  },
): Promise<boolean> {
  const videoTag = args.is_video ? " · video" : "";
  const reason = args.reason.slice(0, 120);
  const notes = `[REVISAR MANUAL] La IA no devolvió un veredicto legible (${reason}). ` +
    `Evidencia guardada — revisar a mano. · unreadable${videoTag}`;
  const { error } = await sb.from("promolog_entries").insert({
    tenant_id: TENANT_ID, creator_id: args.creator_id, date: args.scan_date,
    promoted: "pending", network: "Instagram", platform: "Ninguna", has_buy_link: false,
    notes, evidence_url: args.evidence_url, dispatch_run_id: args.dispatch_run_id,
    apify_run_id: args.apify_run_id, analyzed_by_ai: true, ai_model: LLM_MODEL,
    ai_confidence: 0, ai_reasoning: notes, story_index: args.story_index,
    story_count: args.story_count, story_media_url: args.media_url, scraped_at: args.scraped_at,
    needs_review: true, error_reason: reason, story_pk: args.story_pk ?? null,
  });
  if (error) { console.error("insert unreadable entry failed:", error.message); return false; }
  return true;
}

// "No promocionó / sin historia": la lectura fue EXITOSA y confirmó que NO hay
// historia (o ninguna era promo). promoted='false' = No legítimo.
export async function insertEmptyEntry(
  sb: any,
  args: { creator_id: string; dispatch_run_id: string; apify_run_id: string | null; scan_date: string },
): Promise<void> {
  // Idempotencia: si ya hay una entry de IG hoy (p.ej. un run anterior leyó historias),
  // no agregamos un "sin historias" que la contradiga ni duplique.
  if (await creatorHasInstagramEntry(sb, args.creator_id)) return;
  await sb.from("promolog_entries").insert({
    tenant_id: TENANT_ID, creator_id: args.creator_id, date: args.scan_date,
    promoted: "false", network: "Instagram", platform: "Ninguna", has_buy_link: false,
    notes: "[AUTO] Lectura directa: la creadora no tenía historias activas en el momento del escaneo.",
    dispatch_run_id: args.dispatch_run_id, apify_run_id: args.apify_run_id,
    analyzed_by_ai: true, ai_model: LLM_MODEL, ai_confidence: 1.0,
    ai_reasoning: "Lectura directa a IG con sesión: sin historias activas → no promocionó.",
    story_count: 0,
  });
}

// "Sin datos": la lectura FALLÓ (sesión caída / rate-limit / follow pendiente en
// cuenta privada). NO afirma "no promocionó" → promoted='pending' + error_reason.
export async function insertNoDataEntry(
  sb: any,
  args: { creator_id: string; dispatch_run_id: string; apify_run_id: string | null; scan_date: string; reason?: string },
): Promise<void> {
  const reason = args.reason ?? "read_failed";
  // Idempotencia: no agregues un "sin datos" si ya hay una entry de IG hoy para la
  // creadora (un run que sí leyó gana; el pending no debe duplicar ni pisar).
  if (await creatorHasInstagramEntry(sb, args.creator_id)) return;
  const notes = reason === "follow_pending"
    ? "[SIN DATOS] La cuenta es privada y el follow de la sesión está PENDIENTE de aprobación — no se pudo leer. NO confirma que no haya publicado."
    : reason === "no_ig_id"
    ? "[SIN DATOS] No se pudo resolver el usuario de IG (handle posiblemente roto/renombrado). NO confirma que no haya publicado."
    : reason === "throttled"
    ? "[SIN DATOS] IG limitó la sesión al leer (throttle) — se reintenta en el próximo scan. NO confirma que no haya publicado."
    : reason === "http_0"
    ? "[SIN DATOS] Falla de red al leer — se reintenta en el próximo scan. NO confirma que no haya publicado."
    : "[SIN DATOS] No se pudo leer la historia (sesión/red). NO confirma que la creadora no haya publicado.";
  await sb.from("promolog_entries").insert({
    tenant_id: TENANT_ID, creator_id: args.creator_id, date: args.scan_date,
    promoted: "pending", network: "Instagram", platform: "Ninguna", has_buy_link: false,
    notes,
    dispatch_run_id: args.dispatch_run_id, apify_run_id: args.apify_run_id,
    analyzed_by_ai: false,
    ai_reasoning: `Lectura directa fallida (${reason}): no ausencia confirmada.`,
    // error_reason real (no_ig_id | follow_pending | read_failed) → el drain trata
    // no_ig_id/follow_pending como TERMINALES del día (no re-intenta en vano).
    story_count: 0, needs_review: false, error_reason: reason,
  });
}

async function processStory(args: {
  sb: any; story: StoryItem; storyIndex: number; storyCount: number;
  creator: CreatorCtx; run: RunCtx;
}): Promise<{ inserted: boolean; promoted?: boolean } | { error: string }> {
  const { story, run, creator } = args;
  const isVideo = story.type === "video";
  const mediaUrl = story.mediaUrl;
  if (!mediaUrl) return { error: "no_story_media" };
  const videoUrl = story.videoUrl;
  const caption = story.caption;

  // Idempotencia: si esta MISMA historia (por su pk de IG) ya fue analizada hoy, no la
  // re-analizamos (ahorra Gemini) ni duplicamos la fila/imagen. Devolvemos el veredicto
  // previo para que promotedAny siga siendo correcto.
  if (story.pk) {
    const { data: dup } = await args.sb.from("promolog_entries").select("promoted")
      .eq("creator_id", creator.creatorId).eq("story_pk", story.pk)
      .gte("created_at", dedupSince()).limit(1);
    if (dup && dup.length) return { inserted: false, promoted: dup[0].promoted === "true" };
  }
  const evidenceKey = story.pk ?? `${run.dispatchRunId}-${args.storyIndex}`;

  const l1 = await analyzeImageStory(mediaUrl, caption, run.openrouterKey, creator.ofNicks, creator.sourceHandle);
  if ("error" in l1) {
    if (l1.imageBytes && l1.mime) {
      const durableUrl = await persistEvidence(args.sb, {
        bytes: l1.imageBytes, mime: l1.mime,
        creatorId: creator.creatorId, key: evidenceKey,
      });
      const inserted = await insertUnreadableEntry(args.sb, {
        creator_id: creator.creatorId, dispatch_run_id: run.dispatchRunId, apify_run_id: run.apifyRunId,
        story_index: args.storyIndex, story_count: args.storyCount, media_url: mediaUrl,
        evidence_url: durableUrl ?? mediaUrl, scraped_at: story.timestamp, scan_date: run.scanDate,
        reason: l1.error, is_video: isVideo, story_pk: story.pk ?? null,
      });
      return { inserted };
    }
    return { error: `l1: ${l1.error}` };
  }

  let final = l1.analysis;
  let analysisLevel = "thumbnail_only";
  if (isVideo && videoUrl && l1.analysis.confidence < VIDEO_REANALYZE_THRESHOLD) {
    const l2 = await analyzeVideoStory(videoUrl, caption, run.openrouterKey, creator.ofNicks, creator.sourceHandle);
    if (!("error" in l2)) {
      if (l2.analysis.confidence > l1.analysis.confidence) { final = l2.analysis; analysisLevel = "video_full"; }
      else analysisLevel = "video_tried_lower_conf";
    } else analysisLevel = `video_failed:${l2.error.slice(0, 50)}`;
  }

  const linkClass = classifyLinkDestination(story.linkUrl, creator.knownFunnelHosts);
  const storyLinkUrl = linkClass.decoded || null;
  const linkIsCasino = linkClass.tier === "casino";
  const linkIsPromo = linkClass.tier === "paid" || linkClass.tier === "aggregator";
  // Las modelos NO pueden poner link directo a OnlyFans en IG (está prohibido) → usan su
  // PROPIA página / dominio custom (ej. danikmichell.co, aynaraeder.cl) como funnel hacia OF.
  // Un link sticker QUE CONTIENE su handle/nick/nombre es casi seguro ese funnel → cuenta
  // como PROMO, aunque la visión no haya visto el sticker en el thumbnail.
  // ⚠️ Matcheamos contra TODO el link (host + path), no solo el host: el nombre suele ir en
  // el path (bybio.co/bysaritac, link.me/x/saritac) → con host-only se perdía (caso SaritaC
  // 2026-07-19). OJO: exigimos el match con la creadora para NO marcar afiliados/productos
  // (thecbdperfection.com, solzetech.com…) que también son dominios desconocidos pero NO son
  // su funnel de OF.
  const linkMatchesCreator = matchesCreatorFunnel(
    linkClass.decoded || story.linkUrl, linkClass.host,
    creator.sourceHandle, creator.ofNicks, creator.name,
  );
  // ⚠️ NO cuenta como funnel propio si el host es un ACORTADOR: oculta el destino, y las
  // modelos marcan sus links de AFILIADO con su propio nombre (rebrand.ly/carolinaromo_4_ig
  // → STOCKITY, trading). El nombre en el path de un acortador no prueba que sea su OF.
  // Su propio TELEGRAM como funnel: una historia de IG cuyo sticker apunta a SU canal de
  // Telegram (t.me/<algo que la matchea>) es empuje a su embudo → cuenta como promo en IG
  // (decisión del dueño 2026-07-23). t.me es NONPAID en el classifier, así que NO cae en la
  // rama de arriba (tier unknown); lo detectamos aparte. Los invites privados anónimos
  // (t.me/+hash) NO matchean a la creadora → quedan afuera solos. El puente IG→Telegram
  // sigue disparando el scan del canal por separado (allá se cuenta lo que promocione en TG).
  // GUARD: un funnel propio (Telegram o dominio custom) que lleva a un CURSO DE FINANZAS /
  // TRADING / CASINO / academia NO es promo de OnlyFans, aunque el link sea "suyo".
  // Caso real: elizabethloaiza pivoteó a "Efecto Messi" (educación financiera) — su
  // Telegram es el curso, no OF → una historia de IG con sticker a su t.me NO cuenta.
  // Solo aplica al funnel AMBIGUO (t.me / dominio propio); un link explícito a
  // onlyfans/fansly (linkIsPromo) no se toca.
  const nonOfFunnelRe = /trading|forex|cript[oó]|crypto|inversi[óo]n|invertir|se[ñn]ales|\bcurso\b|masterclass|academ|finan(zas|ciera)|educaci[óo]n financiera|casino|apuest|gana(r)?\s+dinero|efecto\s+messi/i;
  const looksNonOfFunnel = nonOfFunnelRe.test(`${caption ?? ""} ${final.reasoning ?? ""}`);
  const linkIsOwnTelegram = /(?:^|\.)(?:t|telegram)\.me$/.test((linkClass.host || "").toLowerCase())
    && linkMatchesCreator && !looksNonOfFunnel;
  const linkIsOwnFunnel = ((linkClass.tier === "unknown" && !isShortener(linkClass.host)
    && !!(story.linkUrl && story.linkUrl.trim()) && linkMatchesCreator)
    || linkIsOwnTelegram) && !looksNonOfFunnel;
  const linkPlatform = (linkClass.platform && linkClass.platform !== "none" && linkClass.platform !== "other")
    ? linkClass.platform : (creator.knownPlatform ?? (linkIsOwnFunnel ? "onlyfans" : "other"));

  if (linkIsCasino) {
    final = {
      ...final, promoted: false, promotion_type: "none", has_buy_link: false, buy_link_type: null,
      reasoning: `Link a casino/apuestas (${linkClass.host}) — afiliado, no es contenido pago de la creadora → No. ${final.reasoning ?? ""}`.slice(0, 240),
    };
    analysisLevel += "+casino_discard";
  } else if (linkIsPromo || linkIsOwnFunnel) {
    // Hay un sticker de link a promo/funnel propio → es PROMO. Idempotente: corre AUNQUE
    // la visión ya haya dicho Sí, para normalizar has_buy_link/buy_link_type y anotar el
    // link — si no, quedaban filas "promoted=true con razonamiento 'no hay ningún link'"
    // (caso SaritaC: la visión no vio el sticker en el thumbnail). Solo respetamos el
    // razonamiento de la visión si ya describía un buy-link real (no lo pisamos).
    const keepReason = final.promoted && final.has_buy_link;
    final = {
      ...final,
      promoted: true,
      promotion_type: final.promoted && final.promotion_type !== "none" ? final.promotion_type : "direct",
      has_buy_link: true,
      buy_link_type: (final.buy_link_type && final.buy_link_type !== "other") ? final.buy_link_type : linkPlatform,
      platform_mentioned: final.platform_mentioned && final.platform_mentioned !== "ninguna"
        ? final.platform_mentioned : (creator.knownPlatform ?? "onlyfans"),
      reasoning: keepReason
        ? final.reasoning
        : `Sticker de link → ${linkClass.host} (${linkIsPromo ? "CTA a contenido pago" : "página/funnel propio → OF (link directo a OF está prohibido en IG)"}).`.slice(0, 240),
    };
    analysisLevel += linkIsPromo ? "+link_sticker" : "+link_sticker_funnel";
  } else if (final.promoted && (final.buy_link_type === "other" || !final.buy_link_type)) {
    if (linkClass.tier === "none" && creator.knownPlatform) final = { ...final, buy_link_type: creator.knownPlatform };
  }

  // Red de seguridad watermark: la IA dice que HAY buy-link a plataforma MANEJADA (OF)
  // pero NINGÚN sticker de link real lo respalda (ni promo ni funnel propio) → la única
  // evidencia es VISUAL (watermark/overlay/texto). Puede ser un "Sí" legítimo (nick de
  // OF real, gorra "ONLYFANS"), así que el resultado se respeta pero se marca para
  // revisión humana: acá vivían los FP de firma de IG (elizabethloaiza, Anadevinvip,
  // SaritaC). NO dependemos de story.linkUrl: un sticker a un destino NO-promo (YouTube,
  // afiliado) no valida un buy-link visual → seguiría siendo solo-visual. Y solo para
  // claim MANEJADO: si la IA dijo Fansly/Piclink, no nos interesa (score 0) y no inunda
  // la cola marcándola needs_review (qualityForEntry trata needs_review como OF-válida).
  const claimedManaged = ["onlyfans", "piclink"].includes((final.buy_link_type || "").toLowerCase()) ||
    ["onlyfans", "piclink", "unlok"].includes((final.platform_mentioned || "").toLowerCase());

  // CTA sin NINGUNA evidencia de pago → NO cuenta (regla del dueño: promo = puntero a
  // OF/pago/funnel). La visión a veces marca Sí por un CTA genérico ("VIDEO COMPLETO
  // AQUÍ") aunque ella misma reporte plataforma "ninguna" y el buy-link quede en "other"
  // sin knownPlatform que lo respalde, y ningún sticker real apunte a pago/funnel.
  // Resultado visible: "Sí" con calidad 0% — contradicción (caso wanderslover 2026-07-22,
  // creadora de comedia: el CTA era de su show). Las creadoras CON onlyfans_url
  // registrado no pasan por acá (su buy_link_type ya se elevó a knownPlatform arriba).
  const noPaidEvidence = final.promoted && !linkIsPromo && !linkIsOwnFunnel && !claimedManaged &&
    (final.buy_link_type === "other" || !final.buy_link_type) &&
    ["ninguna", ""].includes((final.platform_mentioned || "").toLowerCase());
  if (noPaidEvidence) {
    final = {
      ...final, promoted: false, promotion_type: "none",
      reasoning: `CTA sin destino de pago identificable (plataforma "ninguna", link no-pago/inexistente) → no cuenta como promo de OF. ${final.reasoning ?? ""}`.slice(0, 240),
    };
    analysisLevel += "+no_paid_evidence";
  }

  const visualLinkOnly = final.promoted && final.has_buy_link && claimedManaged &&
    !linkIsPromo && !linkIsOwnFunnel;
  const needsReview = !linkIsCasino && (
    final.confidence < NEEDS_REVIEW_THRESHOLD ||
    visualLinkOnly ||
    (final.promoted && (final.buy_link_type === "other" || !final.buy_link_type) &&
      (linkClass.tier === "nonpaid" || linkClass.tier === "unknown")));

  const durableUrl = await persistEvidence(args.sb, {
    bytes: l1.imageBytes, mime: l1.mime,
    creatorId: creator.creatorId, key: evidenceKey,
  });

  const inserted = await insertAnalyzedEntry(args.sb, {
    creator_id: creator.creatorId, dispatch_run_id: run.dispatchRunId, apify_run_id: run.apifyRunId,
    story_index: args.storyIndex, story_count: args.storyCount, media_url: mediaUrl,
    evidence_url: durableUrl ?? mediaUrl, scraped_at: story.timestamp, scan_date: run.scanDate,
    analysis: final, analysis_level: analysisLevel, needs_review: needsReview,
    story_link_url: storyLinkUrl, is_video: isVideo, source_handle: creator.sourceHandle,
    known_platform: creator.knownPlatform, story_pk: story.pk ?? null,
  });
  return { inserted, promoted: final.promoted };
}

// analyzeStoryItems — corre processStory sobre las historias de UNA creadora
// (concurrencia CONCURRENCY). Devuelve conteo + si alguna resultó promo.
export async function analyzeStoryItems(
  sb: any, creator: CreatorCtx, items: StoryItem[], run: RunCtx,
): Promise<{ entriesCreated: number; promotedAny: boolean; errors: string[] }> {
  const limited = items.slice(0, MAX_STORIES_PER_CREATOR);
  let entriesCreated = 0;
  let promotedAny = false;
  const errors: string[] = [];
  for (let i = 0; i < limited.length; i += CONCURRENCY) {
    const chunk = limited.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map((story, j) =>
        processStory({ sb, story, storyIndex: i + j, storyCount: limited.length, creator, run })
          .catch((e) => ({ error: (e as Error).message }))),
    );
    for (const r of chunkResults) {
      if (r && "error" in r) errors.push(r.error);
      else if (r && r.inserted) { entriesCreated++; if (r.promoted) promotedAny = true; }
    }
  }
  return { entriesCreated, promotedAny, errors };
}
