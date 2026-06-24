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
// Máx historias por creadora que analizamos (regla de negocio: 10/creadora).
// Acota el costo de Gemini por creadora y mantiene el webhook bien bajo el
// timeout (con concurrencia 5 + posible re-análisis de video, 10 entran de sobra).
const MAX_STORIES_PER_CREATOR = 10;
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

// Extrae el nickname de OnlyFans de una URL (onlyfans.com/<nick>) o handle pelado.
function ofNickFromUrl(url: string): string {
  let s = (url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) {
    try { s = new URL(s).pathname.split("/").filter(Boolean)[0] ?? ""; } catch { return ""; }
  }
  return s.replace(/^@+/, "").toLowerCase().trim();
}

// Cláusula que se anexa al VISION_PROMPT con los nicks de OF de la creadora: si
// Gemini ve el nick (watermark/overlay/texto/caption), lo cuenta como promo directa.
function ofNicksClause(nicks: string[]): string {
  const clean = (nicks || []).filter(Boolean);
  if (!clean.length) return "";
  const list = clean.map((n) => `@${n}`).join(", ");
  return `\n\nNICKNAMES DE ONLYFANS DE ESTA CREADORA: ${list}.\n` +
    `Si ves CUALQUIERA de estos nombres EXACTOS en la imagen/video (watermark, overlay, sticker, texto sobreimpreso) o en el caption, contá eso como un PUNTERO a contenido pago aunque NO haya link clickeable: poné has_buy_link=true, buy_link_type="onlyfans", platform_mentioned="onlyfans", promoted=true, promotion_type="direct", y citá el nick visto en "reasoning". OJO: tiene que ser el NICK como texto/watermark visible, NO inferirlo de que la foto se parece a ella.`;
}

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
    .select("id, apify_run_id, payload, status, tenant_id, created_at")
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

  // Fecha de la ENTRY = fecha del SCAN (cuándo se corrió el análisis), NO la
  // hora de posteo de la story. Las stories activas suelen haberse posteado
  // "ayer" (ventana de 24h), así que fechar por posteo las archivaba bajo ayer
  // y se deduplicaban → nunca aparecían bajo "Hoy". La hora de posteo real se
  // preserva aparte en `scraped_at`. Usamos created_at del dispatch_run (inicio
  // del scan) para que un scan que cruza medianoche quede bajo su propio día.
  const scanDate = run.created_at ?? new Date().toISOString();

  // Costo del run (best-effort) → columna "Costo" del panel de Promobot.
  // Se captura igual para runs fallidos: un run que falló igual consumió cómputo.
  const costUsd = await fetchRunCost(apifyRunId, APIFY_TOKEN);

  // ── Handle non-SUCCEEDED outcomes ───────────────────────────────────────
  if (status !== "SUCCEEDED") {
    await (sb as any)
      .from("promolog_dispatch_runs")
      .update({
        status: status === "TIMED-OUT" ? "timeout" : "failed",
        error: `Apify run ended with status=${status}`,
        cost_usd: costUsd,
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
    .select("id, instagram_handle, onlyfans_url, piclink_url")
    .in("id", creatorIds);

  const handleToCreator = new Map<string, string>();
  // Multi-cuenta OF: nicknames de OnlyFans por creadora (principal onlyfans_url +
  // secundarias). Se pasan al prompt de Gemini para que cuente un watermark/overlay/
  // mención del nick (aunque no haya link clickeable) como promoción directa.
  const ofNicksByCreator = new Map<string, string[]>();
  // Plataforma de pago CONOCIDA por creadora (su contenido pago principal). Se usa
  // para INFERIR el destino cuando la IA decidió que promocionó pero no pudo atar la
  // story a una plataforma nombrada (embudo IG → "respondo en mi privado" → OF). OF
  // tiene prioridad sobre Piclink.
  const knownPlatformByCreator = new Map<string, string>();
  for (const c of (creatorsData ?? []) as any[]) {
    const h = normalizeHandle(c.instagram_handle ?? "");
    if (h) handleToCreator.set(h, c.id);
    const nick = ofNickFromUrl(c.onlyfans_url ?? "");
    ofNicksByCreator.set(c.id, nick ? [nick] : []);
    if (String(c.onlyfans_url ?? "").trim()) knownPlatformByCreator.set(c.id, "onlyfans");
    else if (String(c.piclink_url ?? "").trim()) knownPlatformByCreator.set(c.id, "piclink");
  }

  // Multi-cuenta: sumar las cuentas IG EXTRA al mapa de handles (así una story de
  // CUALQUIER cuenta IG cae en el mismo creator_id; la dedup colapsa a 1 fila/día),
  // y los nicks de OF EXTRA a la señal del prompt. Una sola query: network in (ig, of).
  const { data: extraAccounts } = creatorIds.length
    ? await (sb as any)
        .from("creator_social_accounts")
        .select("creator_id, network, username")
        .in("network", ["instagram", "onlyfans"])
        .in("creator_id", creatorIds)
    : { data: [] as Array<{ creator_id: string; network: string; username: string }> };
  for (const a of (extraAccounts ?? []) as Array<{ creator_id: string; network: string; username: string }>) {
    if (a.network === "instagram") {
      const h = normalizeHandle(a.username ?? "");
      if (h && !handleToCreator.has(h)) handleToCreator.set(h, a.creator_id);
    } else { // onlyfans extra → suma como nick para el prompt
      const nick = String(a.username ?? "").replace(/^@+/, "").toLowerCase().trim();
      if (nick) {
        const arr = ofNicksByCreator.get(a.creator_id) ?? [];
        if (!arr.includes(nick)) arr.push(nick);
        ofNicksByCreator.set(a.creator_id, arr);
      }
    }
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
  // Creadoras (de las despachadas) que terminaron con AL MENOS una entry. Las
  // que no queden acá reciben una entry "No / sin historia" en el sweep final.
  const creatorsWithEntries = new Set<string>();

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
          scan_date: scanDate,
        });
        creatorsWithEntries.add(creatorId);
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
              scanDate,
              openrouterKey: OPENROUTER_API_KEY,
              sourceHandle: handle,
              ofNicks: ofNicksByCreator.get(creatorId) ?? [],
              knownPlatform: knownPlatformByCreator.get(creatorId) ?? null,
            }).catch((e) => ({ error: (e as Error).message })),
          ),
        );

        for (const r of chunkResults) {
          if (r && "error" in r) {
            errors.push({ handle, error: `story: ${r.error}` });
          } else if (r && r.inserted) {
            entriesCreated++;
            creatorsWithEntries.add(creatorId);
          }
        }
      }
    } catch (e) {
      creatorsFailed++;
      errors.push({ handle, error: (e as Error).message });
    }
  }

  // ── Sweep: las despachadas SIN ninguna entry = escaneadas que no subieron
  // historia (Apify devolvió "no_story_media" o ni las incluyó). Se les crea
  // UNA entry "No promocionó / sin historia" con la nota, para que el dashboard
  // cuente el total real de escaneadas y queden marcadas "No" (no "sin análisis").
  for (const cid of creatorIds) {
    if (creatorsWithEntries.has(cid)) continue;
    await insertEmptyEntry(sb, {
      creator_id: cid,
      dispatch_run_id: dispatchRunId,
      apify_run_id: apifyRunId,
      scan_date: scanDate,
    });
    creatorsWithEntries.add(cid);
    entriesCreated++;
  }

  // creators_succeeded = COBERTURA real (creadoras distintas con al menos una entry),
  // no "las que tenían stories en el dataset". Antes contaba solo el loop de itemsByHandle
  // (reportaba 3 de 12 cuando el sweep cubría el resto). Cobertura = lo que realmente
  // se escaneó; promocionar o no es otra cosa.
  creatorsSucceeded = creatorsWithEntries.size;

  // ── Update final ────────────────────────────────────────────────────────
  await (sb as any)
    .from("promolog_dispatch_runs")
    .update({
      status: creatorsFailed > 0 && creatorsSucceeded > 0 ? "partial" : (creatorsFailed > 0 ? "failed" : "succeeded"),
      creators_succeeded: creatorsSucceeded,
      creators_failed: creatorsFailed,
      entries_created: entriesCreated,
      cost_usd: costUsd,
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

// fetchRunCost — costo en USD del run de Apify (usageTotalUsd), para la columna
// "Costo" del panel de Promobot. El run object lo trae ya finalizado cuando el
// run llega a estado terminal (que es justo cuando el webhook se dispara).
// Best-effort: si el GET falla devolvemos null y la columna queda en "—" — el
// costo no es crítico para procesar las entries, solo informativo.
async function fetchRunCost(apifyRunId: string, token: string): Promise<number | null> {
  try {
    const resp = await fetch(`https://api.apify.com/v2/actor-runs/${apifyRunId}?token=${token}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const usd = data?.data?.usageTotalUsd;
    return typeof usd === "number" ? usd : null;
  } catch (_) {
    return null;
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
  scanDate: string;
  openrouterKey: string;
  sourceHandle: string;
  ofNicks: string[];
  knownPlatform: string | null;
}): Promise<{ inserted: boolean } | { error: string }> {
  const { story, openrouterKey } = args;
  // mediaType: viejo actor usa `type` ("video"); nuevo (automation-lab) usa
  // `mediaType` ("Image"/"Video").
  const isVideo = ["video"].includes(String(story.type ?? story.mediaType ?? "").toLowerCase());

  // Thumbnail (imagen para analizar con Vision). Campos según actor:
  //   viejo: displayUrl / imageUrl   ·   nuevo: thumbnailUrl (o mediaUrl si es Image)
  // Solo aceptamos media REAL. Si no hay thumbnail (o es una URL de PERFIL de
  // IG, que el actor viejo devolvía cuando no había stories → muro de login),
  // descartamos: sin imagen real no hay story que analizar.
  const mediaUrl = story.displayUrl ?? story.imageUrl ?? story.thumbnailUrl ??
    (!isVideo ? story.mediaUrl : null) ?? null;
  if (!mediaUrl || /instagram\.com\/[^/?#]+\/?(?:[?#]|$)/i.test(mediaUrl)) {
    return { error: "no_story_media" };
  }

  // Video URL para re-análisis nivel 2: viejo usa `videoUrl`; nuevo, `mediaUrl`.
  const videoUrl: string | null = story.videoUrl ?? (isVideo ? (story.mediaUrl ?? null) : null);
  const caption: string | null = story.caption ?? null;

  // ── Nivel 1: thumbnail + caption ────────────────────────────────────────
  const l1 = await analyzeImageStory(mediaUrl, caption, openrouterKey, args.ofNicks);
  if ("error" in l1) {
    // Si bajamos la imagen pero el modelo no devolvió un veredicto legible
    // (JSON inválido, refusal, timeout), NO descartamos la story: persistimos
    // su evidencia y dejamos una entry "pending / revisar manual" visible en
    // el dashboard. Antes esto se perdía en silencio y la story desaparecía
    // del conteo. Sólo caemos al error duro si ni siquiera tenemos los bytes.
    if (l1.imageBytes && l1.mime) {
      const durableUrl = await persistEvidence(args.sb, {
        bytes: l1.imageBytes,
        mime: l1.mime,
        dispatchRunId: args.dispatchRunId,
        creatorId: args.creatorId,
        storyIndex: args.storyIndex,
      });
      const inserted = await insertUnreadableEntry(args.sb, {
        creator_id: args.creatorId,
        dispatch_run_id: args.dispatchRunId,
        apify_run_id: args.apifyRunId,
        story_index: args.storyIndex,
        story_count: args.storyCount,
        media_url: mediaUrl,
        evidence_url: durableUrl ?? mediaUrl,
        scraped_at: story.timestamp ?? null,
        scan_date: args.scanDate,
        reason: l1.error,
        is_video: isVideo,
      });
      return { inserted };
    }
    return { error: `l1: ${l1.error}` };
  }

  let final = l1.analysis;
  let analysisLevel = "thumbnail_only";

  // ── Nivel 2 (opcional): video completo si es video Y l1 dudoso ──────────
  if (isVideo && videoUrl && l1.analysis.confidence < VIDEO_REANALYZE_THRESHOLD) {
    const l2 = await analyzeVideoStory(videoUrl, caption, openrouterKey, args.ofNicks);
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

  // ── Flag para review manual ─────────────────────────────────────────────
  // (1) confianza baja, o (2) promo con link "other": Gemini detectó un link/CTA
  // pero NO lo pudo atar a una plataforma de pago conocida (OnlyFans/Piclink/…).
  // Esos son los ambiguos tipo "gana aquí / ganancias diarias" (referido/afiliado)
  // que parecen promo pero no son de su contenido → que un humano confirme.
  const needsReview = final.confidence < NEEDS_REVIEW_THRESHOLD ||
    (final.promoted && final.buy_link_type === "other");

  // ── Evidencia durable: subimos el thumbnail (bytes del nivel 1, ya en
  //    memoria) a Storage. La URL de IG/Apify (mediaUrl) expira en horas;
  //    la de Storage no. Best-effort: si falla, caemos al mediaUrl efímero.
  const durableUrl = await persistEvidence(args.sb, {
    bytes: l1.imageBytes,
    mime: l1.mime,
    dispatchRunId: args.dispatchRunId,
    creatorId: args.creatorId,
    storyIndex: args.storyIndex,
  });

  const inserted = await insertAnalyzedEntry(args.sb, {
    creator_id: args.creatorId,
    dispatch_run_id: args.dispatchRunId,
    apify_run_id: args.apifyRunId,
    story_index: args.storyIndex,
    story_count: args.storyCount,
    media_url: mediaUrl,
    evidence_url: durableUrl ?? mediaUrl,
    scraped_at: story.timestamp ?? null,
    scan_date: args.scanDate,
    analysis: final,
    analysis_level: analysisLevel,
    needs_review: needsReview,
    is_video: isVideo,
    source_handle: args.sourceHandle,
    known_platform: args.knownPlatform,
  });

  return { inserted };
}

// analyzeImageStory — nivel 1: thumbnail + caption.
// Devuelve también los bytes/mime ya descargados para que el caller los
// persista como evidencia durable sin re-descargar.
async function analyzeImageStory(
  imageUrl: string,
  caption: string | null,
  apiKey: string,
  ofNicks: string[] = [],
): Promise<
  | { analysis: StoryAnalysis; imageBytes: Uint8Array; mime: string }
  | { error: string; imageBytes?: Uint8Array; mime?: string }
> {
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
  const promptText = VISION_PROMPT + ofNicksClause(ofNicks);
  const content = [
    {
      type: "text",
      text: caption ? `Caption de la story: "${caption}"\n\n${promptText}` : promptText,
    },
    { type: "image_url", image_url: { url: dataUri } },
  ];

  const result = await callOpenRouter(content, apiKey);
  // Imagen bajada OK pero el modelo no dio un veredicto legible (JSON roto,
  // refusal, timeout): devolvemos el error CON los bytes, para que el caller
  // persista la evidencia igual y no pierda la story.
  if ("error" in result) return { error: result.error, imageBytes, mime };
  return { analysis: result.analysis, imageBytes, mime };
}

// analyzeVideoStory — nivel 2: video completo + caption. Gemini 2.5 Flash
// procesa frames del video automáticamente (default ~1 FPS). Pasamos el
// videoUrl directo de Instagram CDN — Gemini lo descarga server-side.
async function analyzeVideoStory(
  videoUrl: string,
  caption: string | null,
  apiKey: string,
  ofNicks: string[] = [],
): Promise<{ analysis: StoryAnalysis } | { error: string }> {
  const promptText = VISION_PROMPT + ofNicksClause(ofNicks);
  const content = [
    {
      type: "text",
      text: caption ? `Caption de la story: "${caption}"\n\n${promptText}` : promptText,
    },
    { type: "video_url", video_url: { url: videoUrl } },
  ];

  return callOpenRouter(content, apiKey);
}

// parseModelJson — Gemini a veces devuelve el JSON envuelto en fences
// markdown (```json … ```) o con prosa alrededor, lo que rompía un
// JSON.parse directo → la story se perdía en silencio. Intentamos, en orden:
// (1) parse directo, (2) sin fences markdown, (3) recortando del primer "{"
// al último "}". Devuelve null si nada parsea a un objeto.
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
  return null;
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

    const parsed = parseModelJson(text);
    if (!parsed) {
      return { error: `json_parse :: ${text.slice(0, 200)}` };
    }

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
    media_url: string;          // URL original de IG/Apify (efímera) → story_media_url
    evidence_url: string;       // URL durable (Storage) o fallback al media_url
    scraped_at: string | null;  // hora real de posteo de la story (preservada)
    scan_date: string;          // fecha del scan → va a `date` (filtra el dashboard)
    analysis: StoryAnalysis;
    // Metadata nueva — para auditar el flow de 2 niveles
    analysis_level?: string;       // "thumbnail_only" | "video_full" | "video_tried_lower_conf" | "video_failed:..."
    needs_review?: boolean;        // true si confidence final < NEEDS_REVIEW_THRESHOLD
    is_video?: boolean;
    source_handle?: string;        // cuenta IG de la que vino la story (multi-cuenta)
    known_platform?: string | null; // plataforma de pago conocida de la creadora (OF/piclink) → para inferir destino
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
  let platform = platformMap[args.analysis.platform_mentioned] ?? "Ninguna";

  // ── Inferencia de plataforma destino ──────────────────────────────────────
  // Si la IA decidió que SÍ promocionó pero NO pudo atar la story a una plataforma
  // nombrada (platform="Ninguna"), el destino es —casi siempre— el contenido pago
  // conocido de la creadora. Una creadora que redirige a su "privado"/"exclusivo"
  // está promocionando su OnlyFans aunque la story no escriba "OnlyFans". En vez de
  // dejar "Ninguna" (que se ve como "promovió pero no sé a dónde"), completamos el
  // destino con su plataforma conocida (OF, o Piclink). NO toca si es promo o no
  // (eso ya lo decidió la IA), solo completa el destino.
  let platformInferred = false;
  if (args.analysis.promoted && platform === "Ninguna" && args.known_platform) {
    platform = args.known_platform;
    platformInferred = true;
  }

  // notes carga la razón del análisis + marcadores de auditoría que un
  // operator puede usar para entender por qué la AI dijo lo que dijo y
  // si necesita review.
  const notesPrefix = args.needs_review ? "[REVISAR MANUAL] " : "[AUTO] ";
  const levelTag = args.analysis_level ? ` · ${args.analysis_level}` : "";
  const videoTag = args.is_video ? " · video" : "";
  const inferredTag = platformInferred ? ` · plataforma inferida (${platform})` : "";
  const notes = `${notesPrefix}${args.analysis.reasoning} (confidence: ${args.analysis.confidence.toFixed(2)}${levelTag}${videoTag}${inferredTag})`;

  const { error } = await sb.from("promolog_entries").insert({
    tenant_id: TENANT_ID,
    creator_id: args.creator_id,
    date: args.scan_date,
    promoted: args.analysis.promoted ? "true" : "false",
    network: "Instagram",
    platform,
    has_buy_link: args.analysis.has_buy_link,
    buy_link_type: args.analysis.buy_link_type,
    notes,
    evidence_url: args.evidence_url,
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
    source_handle: args.source_handle ?? null,
    needs_review: args.needs_review ?? false,
  });

  if (error) {
    console.error("insert entry failed:", error.message);
    return false;
  }
  return true;
}

// insertUnreadableEntry — la imagen se bajó OK pero el modelo no devolvió un
// veredicto legible (JSON roto, refusal, timeout de OpenRouter). En vez de
// tirar la story —que la hacía desaparecer del dashboard— la guardamos como
// pending + revisar manual CON su evidencia, para que un operator la juzgue a
// mano. promoted="pending" → la UI la manda a "Pendientes de revisar" y NO
// contamina los conteos de promovió / no promovió / parcial.
async function insertUnreadableEntry(
  sb: any,
  args: {
    creator_id: string;
    dispatch_run_id: string;
    apify_run_id: string;
    story_index: number;
    story_count: number;
    media_url: string;
    evidence_url: string;
    scraped_at: string | null;  // hora real de posteo (preservada)
    scan_date: string;          // fecha del scan → va a `date`
    reason: string;
    is_video?: boolean;
  },
): Promise<boolean> {
  const videoTag = args.is_video ? " · video" : "";
  const reason = args.reason.slice(0, 120);
  const notes =
    `[REVISAR MANUAL] La IA no devolvió un veredicto legible (${reason}). ` +
    `Evidencia guardada — revisar a mano. · unreadable${videoTag}`;

  const { error } = await sb.from("promolog_entries").insert({
    tenant_id: TENANT_ID,
    creator_id: args.creator_id,
    date: args.scan_date,
    promoted: "pending",
    network: "Instagram",
    platform: "Ninguna",
    has_buy_link: false,
    notes,
    evidence_url: args.evidence_url,
    dispatch_run_id: args.dispatch_run_id,
    apify_run_id: args.apify_run_id,
    analyzed_by_ai: true,
    ai_model: LLM_MODEL,
    ai_confidence: 0,
    ai_reasoning: notes,
    story_index: args.story_index,
    story_count: args.story_count,
    story_media_url: args.media_url,
    scraped_at: args.scraped_at,
    needs_review: true,
  });

  if (error) {
    console.error("insert unreadable entry failed:", error.message);
    return false;
  }
  return true;
}

const EVIDENCE_BUCKET = "promolog-evidence";

// persistEvidence — sube el thumbnail (bytes ya descargados en nivel 1) al
// bucket privado `promolog-evidence` y devuelve un signed URL durable. El
// bucket es privado (convención del proyecto para evidencia, igual que las
// subidas manuales del chatter que ya viven ahí) → firmamos la URL en vez de
// usar getPublicUrl. Best-effort: si el upload/firma falla devolvemos null y
// el caller cae al media_url efímero — nunca bloqueamos la entry por Storage.
// Path estable por run/idx (+ upsert) para que un re-run sobreescriba.
async function persistEvidence(
  sb: any,
  args: {
    bytes: Uint8Array;
    mime: string;
    dispatchRunId: string;
    creatorId: string;
    storyIndex: number;
  },
): Promise<string | null> {
  try {
    const ext = args.mime.includes("png")
      ? "png"
      : args.mime.includes("webp")
      ? "webp"
      : "jpg";
    const path = `${TENANT_ID}/${args.dispatchRunId}/${args.creatorId}-${args.storyIndex}.${ext}`;
    const { error } = await sb.storage.from(EVIDENCE_BUCKET).upload(path, args.bytes, {
      contentType: args.mime,
      upsert: true,
    });
    if (error) {
      console.error("persistEvidence upload failed:", error.message);
      return null;
    }
    const { data, error: signErr } = await sb.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signErr) {
      console.error("persistEvidence sign failed:", signErr.message);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (e) {
    console.error("persistEvidence error:", (e as Error).message);
    return null;
  }
}

async function insertEmptyEntry(
  sb: any,
  args: { creator_id: string; dispatch_run_id: string; apify_run_id: string; scan_date: string },
): Promise<void> {
  await sb.from("promolog_entries").insert({
    tenant_id: TENANT_ID,
    creator_id: args.creator_id,
    date: args.scan_date,
    promoted: "false",
    network: "Instagram",
    platform: "Ninguna",
    has_buy_link: false,
    notes: "[AUTO] No se registraron historias subidas ni promociones en el análisis del perfil.",
    dispatch_run_id: args.dispatch_run_id,
    apify_run_id: args.apify_run_id,
    analyzed_by_ai: true,
    ai_model: LLM_MODEL,
    ai_confidence: 1.0,
    ai_reasoning: "El perfil no tenía historias subidas en el momento del escaneo; no se registró ninguna promoción.",
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
