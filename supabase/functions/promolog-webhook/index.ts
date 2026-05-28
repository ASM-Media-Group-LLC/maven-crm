// promolog-webhook — recibe la notificación de Apify cuando el run termina.
//
// Reemplaza la lógica del microservicio Dokploy que clasificaba stories.
// Flow:
//   1. Apify hace POST con runId, status, defaultDatasetId, dispatch_run_id
//   2. Validamos el dispatch_run_id contra DB (correlación)
//   3. Si status != SUCCEEDED → marca run como failed/timeout
//   4. Sino, baja el dataset de Apify (https://api.apify.com/v2/datasets/<id>/items)
//   5. Por cada story: descarga imagen, llama LLM Vision via OpenRouter
//      (default: google/gemini-2.5-flash) con prompt cualitativo
//      (¿promo OnlyFans? ¿link compra? ¿indirecta?), inserta promolog_entry
//   6. Update run final con counters
//
// NOTA: El webhook es público (verify_jwt=false). Lo securizamos validando
// que el apify_run_id en payload coincida con el row en DB, y que el
// dispatch_run_id de la query string exista. Apify no soporta auth headers
// custom en webhooks así que esto es la mejor opción.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// LLM via OpenRouter (api compatible OpenAI). Default model
// google/gemini-2.5-flash — best precio/calidad para vision sobre stories.
// Si el user quiere cambiar a otro modelo (claude-3.5-sonnet, etc) solo
// updatea el env PROMOLOG_LLM_MODEL.
const LLM_MODEL = Deno.env.get("PROMOLOG_LLM_MODEL") ?? "google/gemini-2.5-flash";
const LLM_TIMEOUT_MS = 30_000;
// Cap conservador: con paralelización a 5 concurrentes y posible re-análisis
// de video por story, 20 stories caben holgadas en el timeout de 150s.
const MAX_STORIES_PER_CREATOR = 20;
// Análisis de stories en paralelo. 5 concurrentes balancea throughput con
// rate-limit de OpenRouter (que es generoso pero igual).
const CONCURRENCY = 5;
// Si después de analizar el thumbnail el modelo no está seguro (videos
// donde el sticker/texto aparece en otros frames), re-analizamos con el
// video completo. Threshold tuneado a 0.7 — más bajo dispara muchas
// re-analyses de stories ya bien clasificadas; más alto deja pasar casos
// dudosos.
const VIDEO_REANALYZE_THRESHOLD = 0.7;
// Si después de TODO el análisis la confianza sigue baja, flag manual.
const NEEDS_REVIEW_THRESHOLD = 0.6;

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";

// Prompt cualitativo: lo importante es detectar promoción de OnlyFans
// (página azul) directa o indirecta + link de compra. La sección final
// "INSTRUCCIONES ESPECIALES" optimiza específicamente para el contexto
// de creadoras de OnlyFans, donde la promoción INDIRECTA es lo más común
// (las creadoras evitan links explícitos para no caer en ban algorítmico
// de IG).
const VISION_PROMPT = `Analizá esta story de Instagram de una creadora de contenido para una agencia de OnlyFans.

Tu job es clasificar SI promueve su contenido de OnlyFans o no. Considerá tres niveles:

1) PROMOCIÓN DIRECTA: muestra link a OnlyFans, página azul, "blue page", LinkTree, link en bio,
   piclink, o cualquier URL/CTA que lleve a contenido pago.
2) PROMOCIÓN INDIRECTA: insinúa contenido +18 sin link explícito (poses sugestivas + caption sutil,
   "DM me", "check my bio", "más en mi página", emojis 🍑🔥💦, mención de "premium content", etc).
3) NO PROMUEVE: contenido lifestyle, viajes, comida, mascotas, sin connotación sexual ni mención
   a sus plataformas pagas.

Devolvé SOLO JSON con esta forma:
{
  "promoted": true | false,                       // true si DIRECTA o INDIRECTA
  "promotion_type": "direct" | "indirect" | "none",
  "has_buy_link": true | false,                   // hay link/CTA visible a contenido pago
  "buy_link_type": "onlyfans" | "piclink" | "linktree" | "fansly" | "other" | null,
  "platform_mentioned": "onlyfans" | "piclink" | "fansly" | "linktree" | "ninguna",
  "confidence": 0.0 a 1.0,                        // qué tan seguro estás
  "reasoning": "una oración corta en español explicando por qué"
}

INSTRUCCIONES ESPECIALES (contexto OnlyFans):
- Las creadoras profesionales de OF NUNCA ponen links explícitos en captions IG (riesgo de ban).
  Por eso la promoción más común es INDIRECTA: ropa sugestiva + caption ambiguo + emoji estratégico.
- Si ves pose insinuante (lencería, bikini, cuerpo destacado) + cualquier caption no-banal,
  inclínate a marcar promoted=indirect con confidence 0.65-0.80.
- Si el caption usa frases como "DM", "in bio", "página", "premium", "VIP", "exclusivo",
  "contenido sin censura", "+18", o emojis sexuales (🍑🔥💦😈🥵), marcá promoted=true.
- Si ves un sticker, watermark, overlay con texto tipo URL/handle (ej "linktr.ee/", "OF",
  "@_creadora_premium"), marcá promoted=true y has_buy_link=true.
- Sé estricto en NO promoción solo cuando el contenido es claramente lifestyle inocuo:
  comida, mascotas, viajes, gym SIN exhibir cuerpo, eventos de trabajo, etc.

Si no ves evidencia clara y la story no parece lifestyle puro, marcá confidence baja (<0.6)
para que se revise manualmente — preferimos falsos positivos que perder promos reales.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Only POST" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

  if (!APIFY_TOKEN || !OPENROUTER_API_KEY) {
    return json({ error: "APIFY_TOKEN or OPENROUTER_API_KEY not configured" }, 500);
  }

  const url = new URL(req.url);
  const dispatchRunIdFromQuery = url.searchParams.get("dispatch_run_id");

  let payload: any = {};
  try {
    payload = await req.json();
  } catch (_) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const dispatchRunId = (payload.dispatch_run_id ?? dispatchRunIdFromQuery) as string | null;
  const apifyRunId = payload.runId as string | null;
  const status = String(payload.status ?? "").toUpperCase();
  const datasetId = payload.defaultDatasetId as string | null;

  if (!dispatchRunId) return json({ error: "Missing dispatch_run_id" }, 400);
  if (!apifyRunId) return json({ error: "Missing runId" }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Validar que el run existe y coincide ────────────────────────────────
  const { data: run, error: rErr } = await (sb as any)
    .from("promolog_dispatch_runs")
    .select("id, apify_run_id, payload, status, tenant_id")
    .eq("id", dispatchRunId)
    .maybeSingle();

  if (rErr || !run) return json({ error: "dispatch_run not found" }, 404);
  if (run.apify_run_id && run.apify_run_id !== apifyRunId) {
    return json({ error: "apify_run_id mismatch" }, 403);
  }
  if (run.status === "succeeded" || run.status === "failed") {
    // Webhook re-entry — Apify a veces reintenta. Idempotente.
    return json({ ok: true, idempotent: true, status: run.status });
  }

  // ── Handle non-SUCCEEDED outcomes ───────────────────────────────────────
  if (status !== "SUCCEEDED") {
    await (sb as any)
      .from("promolog_dispatch_runs")
      .update({
        status: status === "TIMED-OUT" ? "timeout" : "failed",
        error: `Apify run ended with status=${status}`,
        finished_at: new Date().toISOString(),
      })
      .eq("id", dispatchRunId);
    return json({ ok: true, status });
  }

  if (!datasetId) {
    await markFailed(sb, dispatchRunId, "SUCCEEDED but missing defaultDatasetId");
    return json({ error: "Missing defaultDatasetId" }, 400);
  }

  // ── Bajar dataset ───────────────────────────────────────────────────────
  const items = await fetchDataset(datasetId, APIFY_TOKEN);
  if ("error" in items) {
    await markFailed(sb, dispatchRunId, `Dataset fetch failed: ${items.error}`);
    return json({ error: items.error }, 502);
  }

  // ── Map handle → creator_id ─────────────────────────────────────────────
  const creatorIds: string[] = run.payload?.creator_ids ?? [];
  const { data: creatorsData } = await (sb as any)
    .from("creators")
    .select("id, instagram_handle")
    .in("id", creatorIds);

  const handleToCreator = new Map<string, string>();
  for (const c of (creatorsData ?? []) as any[]) {
    const h = normalizeHandle(c.instagram_handle ?? "");
    if (h) handleToCreator.set(h, c.id);
  }

  // ── Agrupar items por handle ────────────────────────────────────────────
  const itemsByHandle = new Map<string, any[]>();
  for (const it of items.data) {
    const handle = normalizeHandle(it.ownerUsername ?? it.username ?? "");
    if (!handle) continue;
    (itemsByHandle.get(handle) ?? itemsByHandle.set(handle, []).get(handle)!).push(it);
  }

  // ── Procesar cada creador (paralelización por story dentro del creador) ──
  // Procesamos creadores en serie pero las stories de cada creador en
  // paralelo con concurrencia CONCURRENCY. Esto da el mejor balance entre
  // throughput y no saturar OpenRouter.
  let entriesCreated = 0;
  let creatorsSucceeded = 0;
  let creatorsFailed = 0;
  const errors: Array<{ handle: string; error: string }> = [];

  for (const [handle, stories] of itemsByHandle) {
    const creatorId = handleToCreator.get(handle);
    if (!creatorId) continue;

    try {
      const limitedStories = stories.slice(0, MAX_STORIES_PER_CREATOR);

      if (limitedStories.length === 0) {
        await insertEmptyEntry(sb, {
          creator_id: creatorId,
          dispatch_run_id: dispatchRunId,
          apify_run_id: apifyRunId,
        });
        entriesCreated++;
        creatorsSucceeded++;
        continue;
      }

      // Procesar stories en chunks de CONCURRENCY paralelos.
      // Cada chunk: bajar+analizar+insertar todas las stories en paralelo.
      for (let i = 0; i < limitedStories.length; i += CONCURRENCY) {
        const chunk = limitedStories.slice(i, i + CONCURRENCY);
        const chunkResults = await Promise.all(
          chunk.map((story, j) =>
            processStory({
              sb,
              story,
              storyIndex: i + j,
              storyCount: limitedStories.length,
              creatorId,
              dispatchRunId,
              apifyRunId,
              openrouterKey: OPENROUTER_API_KEY,
            }).catch((e) => ({ error: (e as Error).message })),
          ),
        );

        for (const r of chunkResults) {
          if (r && "error" in r) {
            errors.push({ handle, error: `story: ${r.error}` });
          } else if (r && r.inserted) {
            entriesCreated++;
          }
        }
      }

      creatorsSucceeded++;
    } catch (e) {
      creatorsFailed++;
      errors.push({ handle, error: (e as Error).message });
    }
  }

  // ── Update final ────────────────────────────────────────────────────────
  await (sb as any)
    .from("promolog_dispatch_runs")
    .update({
      status: creatorsFailed > 0 && creatorsSucceeded > 0 ? "partial" : (creatorsFailed > 0 ? "failed" : "succeeded"),
      creators_succeeded: creatorsSucceeded,
      creators_failed: creatorsFailed,
      entries_created: entriesCreated,
      error: errors.length > 0 ? JSON.stringify(errors.slice(0, 20)) : null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", dispatchRunId);

  return json({
    ok: true,
    creators_succeeded: creatorsSucceeded,
    creators_failed: creatorsFailed,
    entries_created: entriesCreated,
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────

async function fetchDataset(
  datasetId: string,
  token: string,
): Promise<{ data: any[] } | { error: string }> {
  try {
    const resp = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&token=${token}`,
    );
    if (!resp.ok) {
      return { error: `Apify ${resp.status}: ${await resp.text()}` };
    }
    const data = await resp.json();
    return { data: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

interface StoryAnalysis {
  promoted: boolean;
  promotion_type: "direct" | "indirect" | "none";
  has_buy_link: boolean;
  buy_link_type: string | null;
  platform_mentioned: string;
  confidence: number;
  reasoning: string;
}

// processStory — flow completo por story:
//   1. Análisis nivel 1: caption + thumbnail (image_url base64)
//   2. Si is_video Y confidence < threshold: re-analizar con video completo
//      (Gemini 2.5 procesa frames del video automáticamente)
//   3. Insert entry final con el mejor análisis
//
// El "mejor análisis" es el nivel 2 si existió y devolvió confidence
// > nivel 1, sino nivel 1. Si nivel 2 falla, mantenemos nivel 1.
async function processStory(args: {
  sb: any;
  story: any;
  storyIndex: number;
  storyCount: number;
  creatorId: string;
  dispatchRunId: string;
  apifyRunId: string;
  openrouterKey: string;
}): Promise<{ inserted: boolean } | { error: string }> {
  const { story, openrouterKey } = args;
  const mediaUrl = story.displayUrl ?? story.imageUrl ?? story.url;
  if (!mediaUrl) return { error: "no_media_url" };

  const isVideo = String(story.type ?? "").toLowerCase() === "video";
  const videoUrl: string | null = story.videoUrl ?? null;
  const caption: string | null = story.caption ?? null;

  // ── Nivel 1: thumbnail + caption ────────────────────────────────────────
  const l1 = await analyzeImageStory(mediaUrl, caption, openrouterKey);
  if ("error" in l1) return { error: `l1: ${l1.error}` };

  let final = l1.analysis;
  let analysisLevel = "thumbnail_only";

  // ── Nivel 2 (opcional): video completo si es video Y l1 dudoso ──────────
  if (isVideo && videoUrl && l1.analysis.confidence < VIDEO_REANALYZE_THRESHOLD) {
    const l2 = await analyzeVideoStory(videoUrl, caption, openrouterKey);
    if (!("error" in l2)) {
      // Si nivel 2 da más confianza, usamos su resultado. Sino, mantenemos l1
      // pero anotamos que se intentó.
      if (l2.analysis.confidence > l1.analysis.confidence) {
        final = l2.analysis;
        analysisLevel = "video_full";
      } else {
        analysisLevel = "video_tried_lower_conf";
      }
    } else {
      analysisLevel = `video_failed:${l2.error.slice(0, 50)}`;
    }
  }

  // ── Flag para review manual si confidence sigue baja ────────────────────
  const needsReview = final.confidence < NEEDS_REVIEW_THRESHOLD;

  const inserted = await insertAnalyzedEntry(args.sb, {
    creator_id: args.creatorId,
    dispatch_run_id: args.dispatchRunId,
    apify_run_id: args.apifyRunId,
    story_index: args.storyIndex,
    story_count: args.storyCount,
    media_url: mediaUrl,
    scraped_at: story.timestamp ?? null,
    analysis: final,
    analysis_level: analysisLevel,
    needs_review: needsReview,
    is_video: isVideo,
  });

  return { inserted };
}

// analyzeImageStory — nivel 1: thumbnail + caption.
async function analyzeImageStory(
  imageUrl: string,
  caption: string | null,
  apiKey: string,
): Promise<{ analysis: StoryAnalysis } | { error: string }> {
  // Bajar imagen y mandarla como data: URI (Apify URLs expiran rápido,
  // así que mejor bajamos nosotros y pasamos bytes inline).
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
  const content = [
    {
      type: "text",
      text: caption ? `Caption de la story: "${caption}"\n\n${VISION_PROMPT}` : VISION_PROMPT,
    },
    { type: "image_url", image_url: { url: dataUri } },
  ];

  return callOpenRouter(content, apiKey);
}

// analyzeVideoStory — nivel 2: video completo + caption. Gemini 2.5 Flash
// procesa frames del video automáticamente (default ~1 FPS). Pasamos el
// videoUrl directo de Instagram CDN — Gemini lo descarga server-side.
async function analyzeVideoStory(
  videoUrl: string,
  caption: string | null,
  apiKey: string,
): Promise<{ analysis: StoryAnalysis } | { error: string }> {
  const content = [
    {
      type: "text",
      text: caption ? `Caption de la story: "${caption}"\n\n${VISION_PROMPT}` : VISION_PROMPT,
    },
    { type: "video_url", video_url: { url: videoUrl } },
  ];

  return callOpenRouter(content, apiKey);
}

// callOpenRouter — wrapper común para image/video content arrays.
async function callOpenRouter(
  content: unknown[],
  apiKey: string,
): Promise<{ analysis: StoryAnalysis } | { error: string }> {
  // max_tokens=2048 (era 1024) — el prompt tiene una sección
  // "INSTRUCCIONES ESPECIALES" larga y Gemini a veces cortaba el JSON
  // a la mitad del field `reasoning`. Con 2K hay margen amplio. Cuesta
  // ~$0.000005 extra por call (despreciable).
  const body = {
    model: LLM_MODEL,
    messages: [{ role: "user", content }],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 2048,
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

    let parsed: any;
    try { parsed = JSON.parse(text); }
    catch (e) { return { error: `json_parse: ${(e as Error).message} :: ${text.slice(0, 200)}` }; }

    return {
      analysis: {
        promoted: parsed.promoted === true,
        promotion_type: ["direct", "indirect", "none"].includes(parsed.promotion_type)
          ? parsed.promotion_type
          : "none",
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

async function insertAnalyzedEntry(
  sb: any,
  args: {
    creator_id: string;
    dispatch_run_id: string;
    apify_run_id: string;
    story_index: number;
    story_count: number;
    media_url: string;
    scraped_at: string | null;
    analysis: StoryAnalysis;
    // Metadata nueva — para auditar el flow de 2 niveles
    analysis_level?: string;       // "thumbnail_only" | "video_full" | "video_tried_lower_conf" | "video_failed:..."
    needs_review?: boolean;        // true si confidence final < NEEDS_REVIEW_THRESHOLD
    is_video?: boolean;
  },
): Promise<boolean> {
  // Normalizar platform al vocabulario que la UI espera
  const platformMap: Record<string, string> = {
    onlyfans: "onlyfans",
    piclink: "piclink",
    fansly: "fansly",
    linktree: "linktree",
    ninguna: "Ninguna",
  };
  const platform = platformMap[args.analysis.platform_mentioned] ?? "Ninguna";

  // notes carga la razón del análisis + marcadores de auditoría que un
  // operator puede usar para entender por qué la AI dijo lo que dijo y
  // si necesita review.
  const notesPrefix = args.needs_review ? "[REVISAR MANUAL] " : "[AUTO] ";
  const levelTag = args.analysis_level ? ` · ${args.analysis_level}` : "";
  const videoTag = args.is_video ? " · video" : "";
  const notes = `${notesPrefix}${args.analysis.reasoning} (confidence: ${args.analysis.confidence.toFixed(2)}${levelTag}${videoTag})`;

  const { error } = await sb.from("promolog_entries").insert({
    tenant_id: TENANT_ID,
    creator_id: args.creator_id,
    date: args.scraped_at ?? new Date().toISOString(),
    promoted: args.analysis.promoted ? "true" : "false",
    network: "Instagram",
    platform,
    has_buy_link: args.analysis.has_buy_link,
    buy_link_type: args.analysis.buy_link_type,
    notes,
    evidence_url: args.media_url,
    dispatch_run_id: args.dispatch_run_id,
    apify_run_id: args.apify_run_id,
    analyzed_by_ai: true,
    ai_model: LLM_MODEL,
    ai_confidence: args.analysis.confidence,
    ai_reasoning: args.analysis.reasoning,
    story_index: args.story_index,
    story_count: args.story_count,
    story_media_url: args.media_url,
    scraped_at: args.scraped_at,
  });

  if (error) {
    console.error("insert entry failed:", error.message);
    return false;
  }
  return true;
}

async function insertEmptyEntry(
  sb: any,
  args: { creator_id: string; dispatch_run_id: string; apify_run_id: string },
): Promise<void> {
  await sb.from("promolog_entries").insert({
    tenant_id: TENANT_ID,
    creator_id: args.creator_id,
    date: new Date().toISOString(),
    promoted: "false",
    network: "Instagram",
    platform: "Ninguna",
    has_buy_link: false,
    notes: "[AUTO] Sin stories ese día",
    dispatch_run_id: args.dispatch_run_id,
    apify_run_id: args.apify_run_id,
    analyzed_by_ai: true,
    ai_model: LLM_MODEL,
    ai_confidence: 1.0,
    ai_reasoning: "Profile sin stories del día.",
    story_count: 0,
  });
}

async function markFailed(sb: any, dispatchRunId: string, errMsg: string) {
  await sb.from("promolog_dispatch_runs").update({
    status: "failed",
    error: errMsg,
    finished_at: new Date().toISOString(),
  }).eq("id", dispatchRunId);
}

function normalizeHandle(h: string): string {
  // Acepta los mismos 3 formatos que en promolog-dispatch para mapear
  // de vuelta `ownerUsername` de Apify → creators.instagram_handle.
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
