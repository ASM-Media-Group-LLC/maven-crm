// promolog-analyze.ts — análisis con IA de historias de Instagram + escritura de
// entries. Extraído del webhook de Apify para ser la ÚNICA fuente de verdad,
// reutilizable por la lectura directa (`promolog-story-read`). NO tiene efectos
// de top-level (no Deno.serve) → se puede importar sin arrancar un server.
//
// Entrada: una lista de "story items" ya normalizados (ver StoryItem) + metadata
// de la creadora. Salida: inserta 1 promolog_entry por historia (o 1 "No/sin
// historia" / "sin datos" cuando corresponde) y devuelve el conteo.

import { classifyLinkDestination } from "../promolog-webhook/link-classifier.ts";

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
1) DIRECTA (promotion_type="direct", promoted=true, has_buy_link=true): hay un LINK o puntero VISIBLE a contenido pago — sticker/URL de OnlyFans/Piclink/Fansly/Linktree, "link in bio", swipe-up, o un watermark/overlay con un handle o URL de plataforma de pago.
2) INDIRECTA (promotion_type="indirect", promoted=true): NO hay link visible, pero el TEXTO tiene un llamado a la acción claro hacia contenido pago: "escríbeme por mi contenido", "más en mi página / mi OF", "contenido exclusivo / VIP / premium", "suscribite", "DM para el link", o redirección a una cuenta "premium/+18". Tiene que haber una INVITACIÓN a ir a otro lado o comprar — NO alcanza con una foto linda + un emoji.
3) NO PROMUEVE (promotion_type="none", promoted=false): TODO lo demás. Incluye EXPLÍCITAMENTE las fotos sugestivas (lencería, bikini, cuerpo destacado, poses insinuantes) que NO tienen ningún link, mención de plataforma ni llamado a la acción a contenido pago. También lifestyle, selfies, gym, comida, viajes, etc. Estar sexy NO es promocionar.

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

function ofNicksClause(nicks: string[]): string {
  const clean = (nicks || []).filter(Boolean);
  if (!clean.length) return "";
  const list = clean.map((n) => `@${n}`).join(", ");
  return `\n\nNICKNAMES DE ONLYFANS DE ESTA CREADORA: ${list}.\n` +
    `Si ves CUALQUIERA de estos nombres EXACTOS en la imagen/video (watermark, overlay, sticker, texto sobreimpreso) o en el caption, contá eso como un PUNTERO a contenido pago aunque NO haya link clickeable: poné has_buy_link=true, buy_link_type="onlyfans", platform_mentioned="onlyfans", promoted=true, promotion_type="direct", y citá el nick visto en "reasoning". OJO: tiene que ser el NICK como texto/watermark visible, NO inferirlo de que la foto se parece a ella.`;
}

export function normalizeHandle(h: string): string {
  const raw = String(h).trim().replace(/^@/, "");
  const urlMatch = raw.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  return raw.replace(/\/$/, "").toLowerCase();
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

async function callOpenRouter(
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
  const promptText = VISION_PROMPT + ofNicksClause(ofNicks);
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
): Promise<{ analysis: StoryAnalysis } | { error: string }> {
  const promptText = VISION_PROMPT + ofNicksClause(ofNicks);
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

  const l1 = await analyzeImageStory(mediaUrl, caption, run.openrouterKey, creator.ofNicks);
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
    const l2 = await analyzeVideoStory(videoUrl, caption, run.openrouterKey, creator.ofNicks);
    if (!("error" in l2)) {
      if (l2.analysis.confidence > l1.analysis.confidence) { final = l2.analysis; analysisLevel = "video_full"; }
      else analysisLevel = "video_tried_lower_conf";
    } else analysisLevel = `video_failed:${l2.error.slice(0, 50)}`;
  }

  const linkClass = classifyLinkDestination(story.linkUrl, creator.knownFunnelHosts);
  const storyLinkUrl = linkClass.decoded || null;
  const linkIsCasino = linkClass.tier === "casino";
  const linkIsPromo = linkClass.tier === "paid" || linkClass.tier === "aggregator";
  const linkPlatform = (linkClass.platform && linkClass.platform !== "none" && linkClass.platform !== "other")
    ? linkClass.platform : (creator.knownPlatform ?? "other");

  if (linkIsCasino) {
    final = {
      ...final, promoted: false, promotion_type: "none", has_buy_link: false, buy_link_type: null,
      reasoning: `Link a casino/apuestas (${linkClass.host}) — afiliado, no es contenido pago de la creadora → No. ${final.reasoning ?? ""}`.slice(0, 240),
    };
    analysisLevel += "+casino_discard";
  } else if (linkIsPromo && !final.promoted) {
    final = {
      ...final, promoted: true, promotion_type: "direct", has_buy_link: true, buy_link_type: linkPlatform,
      platform_mentioned: final.platform_mentioned && final.platform_mentioned !== "ninguna"
        ? final.platform_mentioned : (creator.knownPlatform ?? "ninguna"),
      reasoning: `Sticker de link → ${linkClass.host} (CTA a contenido pago). ${final.reasoning ?? ""}`.slice(0, 240),
    };
    analysisLevel += "+link_sticker";
  } else if (final.promoted && (final.buy_link_type === "other" || !final.buy_link_type)) {
    if (linkIsPromo) final = { ...final, buy_link_type: linkPlatform };
    else if (linkClass.tier === "none" && creator.knownPlatform) final = { ...final, buy_link_type: creator.knownPlatform };
  }

  const needsReview = !linkIsCasino && (
    final.confidence < NEEDS_REVIEW_THRESHOLD ||
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
