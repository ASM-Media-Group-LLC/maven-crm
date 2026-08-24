import { corsFor } from "../_shared/cors.ts";
// scrape-profile-deep-callback — recibe webhook de Apify cuando termina
// el run lanzado por scrape-profile-deep.
//
// Flow:
//   1. Validar job_id (query) coincide con apify_run_id (body)
//   2. Bajar dataset de Apify
//   3. Extraer profile data del primer item (ownerData populated por
//      addParentData=true en el dispatcher)
//   4. Analizar cada story con OpenRouter Vision (mismo prompt extendido
//      que promolog-webhook + un par de campos extra para estrategia)
//   5. Agregar signals + strategy textual
//   6. Update row profile_analyses (status='complete')
//   7. POST a whatsapp-agent con trigger 'profile_analysis_complete' para
//      que postee al grupo
//
// Mismo patrón que promolog-webhook pero para 1 handle on-demand.
// Default model: google/gemini-2.5-flash via OpenRouter.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = (req: Request) => corsFor(req);

const LLM_MODEL = Deno.env.get("PROMOLOG_LLM_MODEL") ?? "google/gemini-2.5-flash";
const LLM_TIMEOUT_MS = 30_000;
const CONCURRENCY = 5;
const MAX_STORIES = 20;

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";

// Prompt para análisis deep — extiende el de promolog con campos
// específicos para estrategia de venta:
//   - signals.has_agency_signals  → ¿hay branding o mention de agencia?
//   - signals.has_tracker         → ¿usa piclink, linktr.ee, beacons.ai, etc?
//   - signals.tracker_kind        → cuál tracker exactamente
//   - signals.paywall_strength    → soft/medium/strong
//   - signals.audience_vibe       → soft/medium/explicit
//   - signals.leak_risk_signs     → señales de que su contenido se filtra
const VISION_PROMPT = `Analizá esta story de Instagram de una creadora de contenido. Es para una agencia de OnlyFans que necesita estrategia de venta — además de detectar promo, queremos señales sobre cómo abordarla.

Devolvé SOLO JSON con esta forma:
{
  "promoted": true | false,
  "promotion_type": "direct" | "indirect" | "none",
  "has_buy_link": true | false,
  "buy_link_type": "onlyfans" | "piclink" | "linktree" | "beacons" | "fansly" | "other" | null,
  "platform_mentioned": "onlyfans" | "piclink" | "fansly" | "linktree" | "ninguna",
  "confidence": 0.0 a 1.0,
  "reasoning": "una oración corta en español",
  "signals": {
    "has_agency_branding": true | false,
    "agency_name_visible": "string o null",
    "tracker_kind": "piclink" | "linktree" | "beacons" | "ig_native_link" | "other" | "none",
    "paywall_strength": "soft" | "medium" | "strong" | "unknown",
    "audience_vibe": "soft" | "medium" | "explicit",
    "leak_risk_signs": ["mentiones explícitas a watermark, paywall caro, lookbook, etc, máx 3 items"]
  }
}

CONTEXTO OPERACIONAL:
- Las creadoras de OF profesionales NUNCA ponen onlyfans.com directo en bio (riesgo ban IG).
  Usan trackers tipo linktr.ee, piclink.me, beacons.ai como intermediario. Si ves uno de esos, anótalo.
- Si ves logos/watermarks de agencia (KASH, otras agencias, "managed by X", etc.) → has_agency_branding=true.
- audience_vibe: soft=lifestyle/casual, medium=insinuante pero no explícito, explicit=lencería/poses muy sexy.
- paywall_strength: soft=invita a DM/free trial, medium=menciona "VIP"/"exclusive", strong=lookbook/precios altos visibles.
- leak_risk_signs: cosas que sugieren contenido caro o muy expuesto (watermark grueso, "leaked content stop", paywall fuerte, etc).

REGLAS ESTRICTAS:
- NO inventes nada que no veas. Si no estás seguro, marcá unknown/null.
- Si la imagen es lifestyle puro sin connotación, marcá promoted=false, confidence ≥ 0.8.
- Si hay duda razonable, baja la confidence (0.4-0.6) para que se revise.

OUTPUT: solo JSON. Sin markdown.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Only POST" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";

  if (!APIFY_TOKEN || !OPENROUTER_API_KEY) {
    return json(req, { error: "APIFY_TOKEN or OPENROUTER_API_KEY not configured" }, 500);
  }

  const url = new URL(req.url);
  const jobIdFromQuery = url.searchParams.get("job_id");

  let payload: any = {};
  try {
    payload = await req.json();
  } catch (_) {
    return json(req, { error: "Invalid JSON body" }, 400);
  }

  const jobId = (payload.job_id ?? jobIdFromQuery) as string | null;
  // Apify a veces NO sustituye {{resource.X}} en payloadTemplate (bug del
  // actor instagram-scraper documentado en promolog-poll). El runId a
  // veces sí pero status/defaultDatasetId llegan literales tipo "{{...}}".
  // Por eso preferimos siempre consultar Apify API directamente con el
  // apify_run_id que guardamos al dispatchar.
  const bodyRunId = payload.runId as string | null;
  const bodyStatus = String(payload.status ?? "").toUpperCase();
  const bodyDatasetId = payload.defaultDatasetId as string | null;

  if (!jobId) return json(req, { error: "Missing job_id" }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Validar job ─────────────────────────────────────────────────────────
  const { data: job, error: jErr } = await (sb as any)
    .from("profile_analyses")
    .select("id, apify_run_id, status, instagram_handle, source_group_id, source_message_id, requested_by_display_name, context, perspective, tenant_id, created_at")
    .eq("id", jobId)
    .maybeSingle();

  if (jErr || !job) return json(req, { error: "job not found" }, 404);
  if (job.status === "complete" || job.status === "failed") {
    return json(req, { ok: true, idempotent: true, status: job.status });
  }
  if (!job.apify_run_id) {
    return json(req, { error: "job has no apify_run_id (probably never dispatched correctly)" }, 400);
  }

  // ── Detectar placeholders sin sustituir → consultar Apify directamente ──
  // Si CUALQUIER campo crítico viene con `{{`, lo pollearemos.
  const placeholdersDetected =
    bodyStatus.includes("{{") ||
    (bodyDatasetId ?? "").includes("{{") ||
    (bodyRunId ?? "").includes("{{");

  let status: string;
  let datasetId: string | null;
  if (placeholdersDetected || !bodyStatus || !bodyDatasetId) {
    console.warn(`Webhook payload has placeholders or missing fields. Polling Apify API for run ${job.apify_run_id}`);
    const apifyData = await fetchApifyRun(job.apify_run_id, APIFY_TOKEN);
    if ("error" in apifyData) {
      await markFailed(sb, jobId, `Apify API lookup failed: ${apifyData.error}`);
      await notifyAgent(sb, job, CRON_TOKEN, SUPABASE_URL, "failed");
      return json(req, { error: apifyData.error }, 502);
    }
    status = String(apifyData.status ?? "").toUpperCase();
    datasetId = apifyData.defaultDatasetId ?? null;
    // Si Apify aún está corriendo, no procesamos — esperamos otro webhook
    // o que un poll cron lo destranque después.
    const FINAL_STATUSES = ["SUCCEEDED", "FAILED", "TIMED-OUT", "TIMED_OUT", "ABORTED"];
    if (!FINAL_STATUSES.includes(status)) {
      console.log(`Apify still running for ${job.apify_run_id} (status=${status}), waiting...`);
      return json(req, { ok: true, status: "still_running", apify_status: status });
    }
  } else {
    status = bodyStatus;
    datasetId = bodyDatasetId;
  }

  // ── Handle non-SUCCEEDED ────────────────────────────────────────────────
  if (status !== "SUCCEEDED") {
    await (sb as any)
      .from("profile_analyses")
      .update({
        status: status === "TIMED-OUT" || status === "TIMED_OUT" ? "timeout" : "failed",
        error: `Apify run ended with status=${status}`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    // Notificar al grupo del fallo
    await notifyAgent(sb, job, CRON_TOKEN, SUPABASE_URL, "failed");
    return json(req, { ok: true, status });
  }

  if (!datasetId) {
    await markFailed(sb, jobId, "SUCCEEDED but missing defaultDatasetId");
    await notifyAgent(sb, job, CRON_TOKEN, SUPABASE_URL, "failed");
    return json(req, { error: "Missing defaultDatasetId" }, 400);
  }

  // ── Bajar dataset ───────────────────────────────────────────────────────
  const t0 = Date.now();
  const items = await fetchDataset(datasetId, APIFY_TOKEN);
  if ("error" in items) {
    await markFailed(sb, jobId, `Dataset fetch failed: ${items.error}`);
    await notifyAgent(sb, job, CRON_TOKEN, SUPABASE_URL, "failed");
    return json(req, { error: items.error }, 502);
  }

  // ── Extract profile data del primer item ───────────────────────────────
  // Apify pone ownerData populated cuando addParentData=true. Lo busca
  // en cualquier item (el primero suele tener todo).
  let profile: any = null;
  for (const it of items.data) {
    const owner = it.ownerData ?? it.user ?? null;
    if (owner) {
      profile = {
        handle: it.ownerUsername ?? owner.username ?? job.instagram_handle,
        full_name: owner.fullName ?? owner.full_name ?? null,
        biography: owner.biography ?? owner.bio ?? null,
        external_url: owner.externalUrl ?? owner.external_url ?? null,
        followers_count: owner.followersCount ?? owner.followers_count ?? null,
        following_count: owner.followingCount ?? owner.following_count ?? null,
        posts_count: owner.postsCount ?? owner.posts_count ?? null,
        is_verified: owner.verified ?? owner.is_verified ?? null,
        is_business: owner.isBusinessAccount ?? owner.is_business_account ?? null,
        is_private: owner.private ?? owner.is_private ?? null,
        profile_pic_url: owner.profilePicUrl ?? owner.profile_pic_url ?? null,
      };
      break;
    }
  }

  // Si no encontramos profile, igual seguimos con análisis de stories.
  if (!profile) {
    profile = { handle: job.instagram_handle };
  }

  const stories = items.data.slice(0, MAX_STORIES);

  // ── Analizar stories en paralelo ────────────────────────────────────────
  const storiesAnalysis: any[] = [];
  for (let i = 0; i < stories.length; i += CONCURRENCY) {
    const chunk = stories.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((story: any, j: number) =>
        analyzeStory(story, i + j, OPENROUTER_API_KEY).catch((e) => ({
          error: (e as Error).message,
          story_index: i + j,
        })),
      ),
    );
    for (const r of results) {
      if (r) storiesAnalysis.push(r);
    }
  }

  // ── Agregación de signals ───────────────────────────────────────────────
  const signals = aggregateSignals(storiesAnalysis, profile);

  // ── Generar estrategia ─────────────────────────────────────────────────
  // La perspectiva la fijó el bot que pidió el scrape (por departamento): el
  // MISMO análisis se lee distinto según de qué lado del mostrador estás.
  const strategy = job.perspective === "manager_growth"
    ? generateGrowthStrategy(profile, storiesAnalysis, signals, job.context, stories.length)
    : generateStrategy(profile, storiesAnalysis, signals, job.context);

  // ── Update row ──────────────────────────────────────────────────────────
  const duration = Math.round((Date.now() - t0) / 1000);
  await (sb as any)
    .from("profile_analyses")
    .update({
      status: "complete",
      apify_dataset_id: datasetId,
      profile,
      stories_analysis: storiesAnalysis,
      signals,
      strategy,
      stories_count: stories.length,
      duration_seconds: duration,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  // ── Notify whatsapp-agent ───────────────────────────────────────────────
  await notifyAgent(sb, job, CRON_TOKEN, SUPABASE_URL, "complete");

  return json(req, {
    ok: true,
    job_id: jobId,
    stories_analyzed: storiesAnalysis.length,
    duration_seconds: duration,
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────

// Consulta Apify para obtener el status real del run y defaultDatasetId.
// Fallback cuando el webhook llega con placeholders {{...}} sin sustituir.
async function fetchApifyRun(
  runId: string,
  token: string,
): Promise<{ status: string; defaultDatasetId: string | null; finishedAt: string | null } | { error: string }> {
  try {
    const resp = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`,
    );
    if (!resp.ok) return { error: `Apify ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
    const data = await resp.json();
    const r = data?.data ?? {};
    return {
      status: r.status ?? "UNKNOWN",
      defaultDatasetId: r.defaultDatasetId ?? null,
      finishedAt: r.finishedAt ?? null,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function fetchDataset(
  datasetId: string,
  token: string,
): Promise<{ data: any[] } | { error: string }> {
  try {
    const resp = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&token=${token}`,
    );
    if (!resp.ok) return { error: `Apify ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
    const data = await resp.json();
    return { data: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function analyzeStory(story: any, storyIndex: number, apiKey: string): Promise<any> {
  const mediaUrl = story.displayUrl ?? story.imageUrl ?? story.url;
  if (!mediaUrl) return { story_index: storyIndex, error: "no_media_url" };

  // Descargar imagen
  let imageBytes: Uint8Array;
  let mime = "image/jpeg";
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15_000);
    const resp = await fetch(mediaUrl, { signal: ac.signal });
    clearTimeout(t);
    if (!resp.ok) return { story_index: storyIndex, error: `image_${resp.status}` };
    const ct = resp.headers.get("content-type");
    if (ct) mime = ct.split(";")[0].trim();
    imageBytes = new Uint8Array(await resp.arrayBuffer());
  } catch (e) {
    return { story_index: storyIndex, error: `image_fetch: ${(e as Error).message}` };
  }

  const dataUri = `data:${mime};base64,${bytesToBase64(imageBytes)}`;
  const caption: string | null = story.caption ?? null;
  const promptText = caption ? `Caption de la story: "${caption}"\n\n${VISION_PROMPT}` : VISION_PROMPT;

  const body = {
    model: LLM_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
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
        "X-Title": "Maven Profile Deep Analysis",
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return { story_index: storyIndex, error: `openrouter_${resp.status}` };
    const data = await resp.json() as any;
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) return { story_index: storyIndex, error: "openrouter_empty" };

    let parsed: any;
    try { parsed = JSON.parse(text); }
    catch (e) { return { story_index: storyIndex, error: `json_parse: ${(e as Error).message}` }; }

    return {
      story_index: storyIndex,
      media_url: mediaUrl,
      caption,
      scraped_at: story.timestamp ?? null,
      promoted: parsed.promoted === true,
      promotion_type: parsed.promotion_type ?? "none",
      has_buy_link: parsed.has_buy_link === true,
      buy_link_type: parsed.buy_link_type ?? null,
      platform_mentioned: parsed.platform_mentioned ?? "ninguna",
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
      reasoning: String(parsed.reasoning ?? "").slice(0, 500),
      signals: parsed.signals ?? {},
    };
  } catch (e) {
    clearTimeout(t);
    return { story_index: storyIndex, error: `openrouter_call: ${(e as Error).message}` };
  }
}

// Combina las señales por-story en un veredicto agregado del perfil.
function aggregateSignals(stories: any[], profile: any): any {
  const valid = stories.filter((s) => !s.error);
  if (valid.length === 0) {
    return {
      stories_analyzed: 0,
      has_promo_signals: false,
      note: "No se pudo analizar ninguna story",
    };
  }

  const promotedCount = valid.filter((s) => s.promoted).length;
  const directCount = valid.filter((s) => s.promotion_type === "direct").length;
  const indirectCount = valid.filter((s) => s.promotion_type === "indirect").length;

  const hasAgencyBranding = valid.some((s) => s.signals?.has_agency_branding === true);
  const agencyNames = Array.from(new Set(valid.map((s) => s.signals?.agency_name_visible).filter(Boolean)));
  const trackerKinds = Array.from(new Set(valid.map((s) => s.signals?.tracker_kind).filter((k) => k && k !== "none")));
  const paywallStrengths = valid.map((s) => s.signals?.paywall_strength).filter(Boolean);
  const audienceVibes = valid.map((s) => s.signals?.audience_vibe).filter(Boolean);

  // Bio external_url puede revelar el tracker directamente
  let bioTracker: string | null = null;
  const bioUrl = (profile?.external_url ?? "").toLowerCase();
  if (bioUrl.includes("piclink")) bioTracker = "piclink";
  else if (bioUrl.includes("linktr.ee") || bioUrl.includes("linktree")) bioTracker = "linktree";
  else if (bioUrl.includes("beacons.ai")) bioTracker = "beacons";
  else if (bioUrl.includes("onlyfans.com")) bioTracker = "onlyfans_direct";
  else if (bioUrl) bioTracker = "other";

  // Strongest paywall observado
  const paywallRank = { soft: 1, medium: 2, strong: 3, unknown: 0 };
  const maxPaywall = paywallStrengths.reduce<string>(
    (acc, p) => ((paywallRank as any)[p] > (paywallRank as any)[acc] ? p : acc),
    "unknown",
  );

  // Quality estimate basado en followers + promo + audience
  let qualityEstimate = "unknown";
  const followers = Number(profile?.followers_count ?? 0);
  if (followers >= 100_000 && promotedCount >= 1) qualityEstimate = "A+";
  else if (followers >= 30_000 && promotedCount >= 1) qualityEstimate = "A";
  else if (followers >= 10_000) qualityEstimate = "B+";
  else if (followers >= 2_000) qualityEstimate = "B";
  else if (followers > 0) qualityEstimate = "C";

  return {
    stories_analyzed: valid.length,
    promoted_count: promotedCount,
    direct_count: directCount,
    indirect_count: indirectCount,
    has_agency_branding: hasAgencyBranding,
    agency_names_visible: agencyNames,
    tracker_kinds_in_stories: trackerKinds,
    bio_tracker: bioTracker,
    bio_url: profile?.external_url ?? null,
    paywall_strength: maxPaywall,
    audience_vibes_distribution: countBy(audienceVibes),
    quality_estimate: qualityEstimate,
    followers_count: followers,
  };
}

function countBy(arr: string[]): Record<string, number> {
  return arr.reduce((acc, x) => ({ ...acc, [x]: (acc[x] ?? 0) + 1 }), {} as Record<string, number>);
}

// Construye el texto en markdown que el bot va a leer y postear al grupo.
function generateStrategy(profile: any, stories: any[], signals: any, context: string | null): string {
  const lines: string[] = [];
  const handle = profile?.handle ?? "—";
  const followers = profile?.followers_count;
  const fStr = followers ? formatNum(followers) : "—";
  const verifiedBadge = profile?.is_verified ? " ✓" : "";

  lines.push(`📊 @${handle}${verifiedBadge} — análisis deep`);
  lines.push("");

  // Profile
  const bioBits: string[] = [];
  if (followers) bioBits.push(`**${fStr} followers**`);
  if (profile?.posts_count) bioBits.push(`${formatNum(profile.posts_count)} posts`);
  if (profile?.is_private) bioBits.push("⚠️ cuenta privada");
  if (profile?.external_url) bioBits.push(`bio link: ${profile.external_url}`);
  if (bioBits.length > 0) lines.push(`**Profile**: ${bioBits.join(" · ")}`);

  if (profile?.biography) {
    lines.push(`Bio: "${String(profile.biography).slice(0, 140).replace(/\n+/g, " ")}"`);
  }
  lines.push("");

  // Stories
  const total = signals.stories_analyzed ?? 0;
  if (total === 0) {
    lines.push("**Stories**: sin stories analizadas (probablemente no subió hoy o cuenta privada).");
  } else {
    lines.push(`**Stories (${total} últimas)**:`);
    lines.push(`· ${signals.direct_count} promo directa · ${signals.indirect_count} promo indirecta · ${total - signals.promoted_count} sin promo`);
    if (signals.tracker_kinds_in_stories.length > 0) {
      lines.push(`· trackers vistos: ${signals.tracker_kinds_in_stories.join(", ")}`);
    }
  }
  lines.push("");

  // Señales
  lines.push("**Señales**:");
  if (signals.bio_tracker) {
    if (signals.bio_tracker === "piclink") lines.push("· ✅ Ya usa Piclink en bio");
    else if (signals.bio_tracker === "linktree") lines.push("· ⚠️ Usa Linktree en bio — riesgo IG ban + oportunidad pitch Piclink");
    else if (signals.bio_tracker === "onlyfans_direct") lines.push("· 🚨 onlyfans.com directo en bio — alto riesgo de ban, urgente Piclink");
    else if (signals.bio_tracker === "beacons") lines.push("· ⚠️ Usa Beacons — pitch Piclink como alternativa");
    else lines.push(`· Bio link a otro destino: ${signals.bio_url}`);
  } else {
    lines.push("· Sin link en bio");
  }
  if (signals.has_agency_branding) {
    lines.push(`· ⚠️ Branding de agencia visible${signals.agency_names_visible.length ? ` (${signals.agency_names_visible.join(", ")})` : ""} — probablemente ya tiene equipo`);
  } else {
    lines.push("· Sin branding de agencia visible — probablemente trabaja sola");
  }
  if (signals.paywall_strength === "strong") {
    lines.push("· Paywall fuerte detectado — buen target para Content Protector");
  } else if (signals.paywall_strength === "medium") {
    lines.push("· Paywall medio");
  }
  if (signals.followers_count) {
    lines.push(`· Quality estimate: **${signals.quality_estimate}** (basado en ${formatNum(signals.followers_count)} followers + actividad de promo)`);
  }
  lines.push("");

  // Estrategia
  lines.push("**Estrategia recomendada**:");
  const reco = buildRecommendation(signals, profile);
  reco.forEach((r, i) => lines.push(`${i + 1}. ${r}`));

  // Context user
  if (context) {
    lines.push("");
    lines.push(`_Contexto del pedido: "${context}"_`);
  }

  return lines.join("\n");
}

// ── Variante MANAGER (17/08, pedido de Fabiana vía Jhon) ──────────────────────
// El mismo scrape leído desde el otro lado del mostrador: acá la modelo ES de la
// casa y quien pregunta es su MANAGER. Nada de pitches de producto a un lead —
// lo que sirve es CÓMO está usando sus historias/bio para vender y qué corregir.
// El plan de plata (canal débil, lift, precio de sub, ballenas) lo cruza el bot
// con sus tools de BLU/promolog; esto aporta la lectura EN VIVO del contenido.
function generateGrowthStrategy(profile: any, stories: any[], signals: any, context: string | null, rawStoriesCount = 0): string {
  const lines: string[] = [];
  const handle = profile?.handle ?? "—";
  const followers = profile?.followers_count;
  const fStr = followers ? formatNum(followers) : "—";
  lines.push(`📈 @${handle}${profile?.is_verified ? " ✓" : ""} — lectura de crecimiento (modelo de la casa)`);
  lines.push("");

  const bioBits: string[] = [];
  if (followers) bioBits.push(`**${fStr} followers**`);
  if (profile?.posts_count) bioBits.push(`${formatNum(profile.posts_count)} posts`);
  if (profile?.is_private) bioBits.push("⚠️ cuenta privada (mata el alcance de la promo)");
  if (profile?.external_url) bioBits.push(`bio link: ${profile.external_url}`);
  if (bioBits.length > 0) lines.push(`**Perfil**: ${bioBits.join(" · ")}`);
  if (profile?.biography) {
    lines.push(`Bio: "${String(profile.biography).slice(0, 140).replace(/\n+/g, " ")}"`);
  }
  lines.push("");

  const total = signals.stories_analyzed ?? 0;
  if (total === 0 && rawStoriesCount > 0) {
    // 0 analizadas ≠ 0 subidas: si Apify trajo stories y Vision no pudo leerlas
    // (blip técnico), decir "no subió" sería inventar inactividad (review 17/08).
    lines.push(`**Stories**: tenía ${rawStoriesCount} stories hoy pero la lectura visual falló (blip técnico) — NO leer esto como inactividad; reintentar más tarde.`);
  } else if (total === 0) {
    lines.push("**Stories**: sin stories para leer hoy — sin historias no hay promo que medir.");
  } else {
    lines.push(`**Stories (${total} últimas)**: ${signals.direct_count} promo directa · ${signals.indirect_count} indirecta · ${total - signals.promoted_count} sin promo`);
    if (signals.tracker_kinds_in_stories.length > 0) {
      lines.push(`· trackers en stories: ${signals.tracker_kinds_in_stories.join(", ")}`);
    }
  }
  lines.push("");

  lines.push("**Palancas sugeridas** (cruzar con sus números de BLU antes de bajarlas):");
  const moves = buildGrowthMoves(signals, profile, rawStoriesCount);
  moves.forEach((m, i) => lines.push(`${i + 1}. ${m}`));

  if (context) {
    lines.push("");
    lines.push(`_Contexto del pedido: "${context}"_`);
  }
  return lines.join("\n");
}

function buildGrowthMoves(signals: any, profile: any, rawStoriesCount = 0): string[] {
  const moves: string[] = [];
  const total = signals.stories_analyzed ?? 0;
  const directas = signals.direct_count ?? 0;
  const indirectas = signals.indirect_count ?? 0;
  const conPromo = signals.promoted_count ?? 0;
  const sinPromo = total - conPromo;

  // Cadencia y mezcla de promo — el corazón de la lectura.
  if (total === 0 && rawStoriesCount > 0) {
    moves.push("La lectura visual de hoy falló (había stories pero no se pudieron analizar): reintentar más tarde — mientras, trabajar el plan con los números de BLU.");
  } else if (total === 0) {
    moves.push("Cadencia primero: acordar un mínimo diario de historias — hoy la cuenta no está vendiendo nada por IG.");
  } else if (conPromo === 0) {
    moves.push("Sube contenido pero SIN promo: meter 1-2 CTAs suaves por día (indirecta primero) — hoy el funnel no existe.");
  } else if (directas > 0 && indirectas === 0 && directas >= Math.max(1, Math.floor(total / 2))) {
    moves.push("Todo promo directa: quema a la audiencia — balancear con contenido de persona/promo indirecta (regla ~2 de valor por 1 de venta).");
  } else if (sinPromo > 0 && conPromo > 0) {
    moves.push("La mezcla promo/contenido se ve razonable — el foco pasa a la CALIDAD del CTA: que cada promo lleve gancho y link claros.");
  }

  // El link de bio es el punto de conversión de toda la promo.
  // ⚠️ Con 0 stories válidas, aggregateSignals devuelve un objeto SIN
  // bio_url/bio_tracker aunque el perfil tenga link (review 17/08: se llegó a
  // afirmar "SIN link en bio" contradiciendo el propio bloque Perfil del mismo
  // mensaje). La verdad del link vive en profile.external_url — se clasifica
  // desde ahí cuando las signals vienen degeneradas.
  const bioUrl = String(signals.bio_url ?? profile?.external_url ?? "");
  const bioTracker = signals.bio_tracker ?? (
    /onlyfans\.com/i.test(bioUrl) ? "onlyfans_direct"
      : /linktr\.ee|linktree/i.test(bioUrl) ? "linktree"
      : /beacons\./i.test(bioUrl) ? "beacons"
      : /piclink/i.test(bioUrl) ? "piclink"
      : null);
  if (bioTracker === "onlyfans_direct") {
    moves.push("🚨 Bio con onlyfans.com directo = riesgo de ban de IG: mover YA el link a Piclink (interno de la casa).");
  } else if (bioTracker === "linktree" || bioTracker === "beacons") {
    moves.push(`Bio con ${bioTracker}: migrar a Piclink (interno) — mismo link, menos riesgo de ban y con analytics para medir la promo.`);
  } else if (!bioUrl) {
    moves.push("SIN link en bio: la promo de historias no tiene a dónde convertir — resolver esto antes que cualquier otra palanca.");
  }

  if (profile?.is_private) {
    moves.push("Cuenta privada: decidir si es estrategia (funnel a DM) o descuido — en privado las historias no captan tráfico nuevo.");
  }
  if (signals.paywall_strength === "strong") {
    moves.push("Paywall fuerte en su contenido: bien para el valor percibido — cuidar que quede suficiente material 'gratis' que enganche.");
  }

  // Siempre cerrar atando a los números: la lectura visual propone, BLU decide.
  moves.push("Cerrar el plan con sus números: canal débil, lift de promo y ballenas (get_creator_earnings_range + growth feed + top fans) mandan sobre cualquier lectura visual.");
  return moves;
}

function buildRecommendation(signals: any, profile: any): string[] {
  const recs: string[] = [];
  const q = signals.quality_estimate;
  const followers = signals.followers_count ?? 0;

  // Si ya tiene agencia → SaaS only, no Kash
  if (signals.has_agency_branding) {
    recs.push("**NO ofrecer Kash** — ya trabaja con otra agencia. Pivot a SaaS complementario.");
  }

  // Producto primario por quality
  if (q === "A+" || q === "A") {
    recs.push("Pitch primario: **Blu** — destacar IA conversacional + alertas risk OF + multi-cuenta. Modelo con buen volumen, va a apreciar el control.");
  } else if (q === "B+") {
    recs.push("Pitch primario: **Piclink** (link safe en bio) o **Blu** si ya monetiza fuerte. Empezar por Piclink que es entry-point más barato.");
  } else if (q === "B") {
    recs.push("Pitch primario: **Piclink** — ayudala a monetizar el tráfico que tiene sin riesgo de ban.");
  } else if (q === "C") {
    recs.push("Quality C: solo si hay capacidad. Pitch Piclink low-effort.");
  } else {
    recs.push("Quality desconocida — pedí más info antes de pitchear.");
  }

  // Cross-sell Piclink si tracker actual es problemático
  if (signals.bio_tracker === "linktree" || signals.bio_tracker === "onlyfans_direct") {
    recs.push("**Cross-sell Piclink** — el tracker actual (" + signals.bio_tracker + ") la pone en riesgo. Pitch: 'mismo link, pero safe + analytics'.");
  }

  // Content Protector si hay señales de riesgo
  if (signals.paywall_strength === "strong" || followers >= 50_000) {
    recs.push("**Considerar Content Protector** — paywall fuerte o base grande = target de piratería. Cross-sell después que muerda el producto primario.");
  }

  // Si ya usa Piclink, no la pitchees
  if (signals.bio_tracker === "piclink") {
    recs.push("Ya usa Piclink ✓ — focar en Blu + Content Protector si calza.");
  }

  return recs;
}

async function notifyAgent(
  sb: any,
  job: any,
  cronToken: string,
  supabaseUrl: string,
  outcome: "complete" | "failed",
): Promise<void> {
  if (!job.source_group_id) return; // No tenemos a dónde postear

  try {
    await fetch(`${supabaseUrl}/functions/v1/whatsapp-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Token": cronToken,
      },
      body: JSON.stringify({
        group_id: job.source_group_id,
        invoked_by: "profile_analysis_complete",
        profile_analysis_id: job.id,
        outcome,
      }),
    });
  } catch (e) {
    console.warn("notifyAgent failed:", (e as Error).message);
  }
}

async function markFailed(sb: any, jobId: string, errMsg: string) {
  await sb.from("profile_analyses").update({
    status: "failed",
    error: errMsg,
    completed_at: new Date().toISOString(),
  }).eq("id", jobId);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
