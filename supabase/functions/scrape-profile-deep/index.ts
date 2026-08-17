// scrape-profile-deep — análisis deep on-demand de un perfil de Instagram.
//
// Llamado por la tool analyze_profile_deep del whatsapp-agent cuando un
// closer/owner pide en el grupo "@maven analizame a @<handle>".
//
// Flow:
//   1. Validar input (handle normalizado)
//   2. Rate-limit: si hay análisis completo del mismo handle en últimas 24h,
//      devolver el cached (sin gastar Apify de nuevo)
//   3. Crear row profile_analyses (status='queued')
//   4. POST a Apify instagram-scraper con resultsType="stories" + webhook
//      callback a scrape-profile-deep-callback
//   5. Update row con apify_run_id + status='running'
//   6. Devolver { status, job_id, eta_seconds }
//
// El callback se encarga del análisis con Gemini Vision via OpenRouter
// y el post-back al grupo via whatsapp-agent.
//
// Auth: este endpoint se invoca SOLO desde whatsapp-agent (X-Cron-Token)
// o desde la UI admin (JWT con role owner/admin). NO público.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};

// Mismo actor que promolog. Para "deep analysis" pedimos stories + posts
// del handle, pero por ahora hacemos solo stories (la promo de OF se ve
// principalmente ahí). Si el equipo necesita análisis de posts también,
// agregar un segundo run o cambiar resultsType=posts.
const APIFY_ACTOR_ID = "apify~instagram-scraper";

// Límite de stories a scrapear. 20 cubre 99% de casos (la mayoría sube
// 5-15 stories/día).
const APIFY_RESULTS_LIMIT = 20;

// Si hay análisis exitoso del mismo handle en las últimas N horas,
// devolvemos el cached en vez de scrapear de nuevo. Ahorra costo Apify
// y tiempo. 24h es razonable — las stories caducan en 24h igual.
const CACHE_HOURS = 24;

// Tenant fijo por ahora (ASM Tech). Cuando saquemos multi-tenant, el
// agent lo va a pasar como argumento.
const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";

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
  const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN");

  if (!APIFY_TOKEN) {
    return json({ error: "APIFY_TOKEN not configured" }, 500);
  }

  // ── Auth: solo X-Cron-Token (lo invoca whatsapp-agent) o JWT admin ──
  const cronHeader = req.headers.get("x-cron-token");
  const isCron = cronHeader && CRON_TOKEN && cronHeader === CRON_TOKEN;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!isCron) {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing auth" }, 401);

    const { data: userData, error: uErr } = await sb.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Invalid token" }, 401);

    const { data: roleRow } = await (sb as any)
      .from("user_roles").select("role").eq("user_id", userData.user.id).maybeSingle();
    const isAdmin = roleRow?.role && ["admin", "manager", "owner"].includes(roleRow.role);
    if (!isAdmin) return json({ error: "Forbidden: admin/owner only" }, 403);
  }

  // ── Parse body ────────────────────────────────────────────────────────
  let body: {
    instagram_handle?: string;
    requested_by_display_name?: string;
    requested_by_member_id?: string | null;
    source_message_id?: string | null;
    source_group_id?: string | null;
    context?: string | null;
    perspective?: string | null; // 'manager_growth' | 'closer_sale' (null = closer_sale legacy)
    force?: boolean;            // si true, saltea cache de 24h
  } = {};
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const rawHandle = body.instagram_handle?.trim();
  if (!rawHandle) return json({ error: "Missing instagram_handle" }, 400);

  const handle = normalizeHandle(rawHandle);
  if (!handle || handle.length < 2) return json({ error: "Invalid handle" }, 400);

  // ── Cache: ¿hay análisis reciente complete? ─────────────────────────────
  // El cache matchea también la PERSPECTIVA (17/08): la estrategia cacheada es
  // texto ya horneado — si un closer analizó a la modelo ayer (pitch de venta) y
  // hoy pregunta su manager (palancas de crecimiento), servirle el cache sería
  // darle el flavor equivocado. NULL histórico = closer_sale.
  const perspectivaPedida = body.perspective === "manager_growth" ? "manager_growth" : "closer_sale";
  if (!body.force) {
    const since = new Date(Date.now() - CACHE_HOURS * 3600_000).toISOString();
    let cacheQ = (sb as any)
      .from("profile_analyses")
      .select("id, status, created_at, profile, stories_analysis, signals, strategy, stories_count")
      .eq("instagram_handle", handle)
      .eq("status", "complete")
      .gte("created_at", since);
    cacheQ = perspectivaPedida === "manager_growth"
      ? cacheQ.eq("perspective", "manager_growth")
      : cacheQ.or("perspective.is.null,perspective.eq.closer_sale");
    const { data: cached } = await cacheQ
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      return json({
        ok: true,
        status: "cached",
        job_id: cached.id,
        cached_at: cached.created_at,
        analysis: {
          profile: cached.profile,
          stories_analysis: cached.stories_analysis,
          signals: cached.signals,
          strategy: cached.strategy,
          stories_count: cached.stories_count,
        },
      });
    }
  }

  // ── ¿Hay un job en curso para este handle? evitar duplicar ──────────────
  // Mismo criterio que el cache: solo cuenta como "en curso" un job de la MISMA
  // perspectiva — el callback postea al grupo del job original, así que colgarse
  // de un job ajeno dejaría a este grupo sin respuesta (y con otro flavor).
  let inFlightQ = (sb as any)
    .from("profile_analyses")
    .select("id, status, created_at")
    .eq("instagram_handle", handle)
    .in("status", ["queued", "running"])
    .gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString());  // últimos 5 min
  inFlightQ = perspectivaPedida === "manager_growth"
    ? inFlightQ.eq("perspective", "manager_growth")
    : inFlightQ.or("perspective.is.null,perspective.eq.closer_sale");
  const { data: inFlight } = await inFlightQ
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inFlight) {
    return json({
      ok: true,
      status: "in_flight",
      job_id: inFlight.id,
      message: "Job ya en curso, esperá ~1 min",
    });
  }

  // ── Crear row profile_analyses ─────────────────────────────────────────
  const { data: created, error: cErr } = await (sb as any)
    .from("profile_analyses")
    .insert({
      tenant_id: TENANT_ID,
      requested_by_display_name: body.requested_by_display_name ?? null,
      requested_by_member_id: body.requested_by_member_id ?? null,
      source_message_id: body.source_message_id ?? null,
      source_group_id: body.source_group_id ?? null,
      context: body.context ?? null,
      // 'manager_growth' = palancas de crecimiento para una modelo de la casa;
      // 'closer_sale' = pitch de venta a un lead (los NULL históricos = closer).
      perspective: perspectivaPedida,
      instagram_handle: handle,
      status: "queued",
    })
    .select("id")
    .single();

  if (cErr || !created) {
    return json({ error: `Insert profile_analysis failed: ${cErr?.message}` }, 500);
  }

  const jobId = created.id as string;

  // ── Lanzar Apify ────────────────────────────────────────────────────────
  // resultsType="stories" trae stories del handle + ownerData con followers/bio.
  const apifyInput = {
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsType: "stories",
    resultsLimit: APIFY_RESULTS_LIMIT,
    addParentData: true,                // queremos ownerData (followers, bio, etc.)
    searchType: "user",
    searchLimit: 1,
    enhanceUserSearchWithFacebookPage: false,
  };

  // Webhook callback igual que en promolog-dispatch.
  const webhookUrl = `${SUPABASE_URL}/functions/v1/scrape-profile-deep-callback?job_id=${jobId}`;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const webhooks = [
    {
      eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
      requestUrl: webhookUrl,
      headersTemplate: JSON.stringify({
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
      }),
      payloadTemplate: JSON.stringify({
        runId: "{{resource.id}}",
        actorId: "{{resource.actId}}",
        status: "{{resource.status}}",
        defaultDatasetId: "{{resource.defaultDatasetId}}",
        startedAt: "{{resource.startedAt}}",
        finishedAt: "{{resource.finishedAt}}",
        job_id: jobId,
      }),
    },
  ];

  // base64url-encoded webhooks (no base64 estándar — Apify lo rechaza silenciosamente).
  const webhooksB64 = btoa(JSON.stringify(webhooks))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const apifyUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs?token=${APIFY_TOKEN}&webhooks=${webhooksB64}`;

  let apifyRunId: string | null = null;
  let apifyErr: string | null = null;
  try {
    const resp = await fetch(apifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apifyInput),
    });
    const data = await resp.json();
    if (!resp.ok) {
      apifyErr = `Apify ${resp.status}: ${JSON.stringify(data).slice(0, 200)}`;
    } else {
      apifyRunId = data?.data?.id ?? null;
      if (!apifyRunId) apifyErr = "Apify run created but missing id";
    }
  } catch (e) {
    apifyErr = (e as Error).message;
  }

  // ── Update row ──────────────────────────────────────────────────────────
  if (apifyErr) {
    await (sb as any)
      .from("profile_analyses")
      .update({
        status: "failed",
        error: apifyErr,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return json({ error: apifyErr, job_id: jobId }, 502);
  }

  await (sb as any)
    .from("profile_analyses")
    .update({ status: "running", apify_run_id: apifyRunId })
    .eq("id", jobId);

  // ETA aproximado: Apify suele tardar 30-90s para 1 perfil con 20 stories.
  return json({
    ok: true,
    status: "queued",
    job_id: jobId,
    apify_run_id: apifyRunId,
    handle,
    eta_seconds: 75,
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────
function normalizeHandle(h: string): string {
  const raw = String(h).trim().replace(/^@/, "");
  const urlMatch = raw.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  return raw.replace(/\/$/, "").toLowerCase();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
