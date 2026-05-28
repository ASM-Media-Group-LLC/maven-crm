// promolog-dispatch — corre 1x/día via pg_cron (o manual desde el panel).
//
// Reemplaza al microservicio Promolog en Dokploy. Toma la lista de
// creadores activos con instagram_handle y lanza un run de Apify
// (Instagram Scraper) que extrae las stories del día. Apify nos
// notifica via webhook cuando termina (→ promolog-webhook).
//
// Flow:
//   1. Valida auth (X-Cron-Token o JWT admin/manager)
//   2. Verifica que no haya corrido ya hoy (Miami TZ)
//   3. Query v_promolog_eligible_creators
//   4. Crea promolog_dispatch_runs row pending
//   5. POST a Apify con directUrls + webhook
//   6. Update row con apify_run_id + status='running'
//
// Auth: usa service-role internamente. Para invocación manual via UI
// pasamos JWT del admin, validado por el JWT check default de Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d"; // ASM Tech

// Actor de Apify para Instagram stories. apify/instagram-scraper es el
// oficial: acepta directUrls con `https://instagram.com/<handle>/` y un
// resultsType. Para stories del día, resultsType="stories".
// Doc: https://apify.com/apify/instagram-scraper/input-schema
const APIFY_ACTOR_ID = "apify~instagram-scraper";

// Máximo creadores por run para no sobrepasar timeout del actor (cada
// stories ~ 1-3s scraping). Si superamos esto, partimos en multiples runs.
const MAX_CREATORS_PER_RUN = 100;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN");

  if (!APIFY_TOKEN) {
    return json({ error: "APIFY_TOKEN not configured" }, 500);
  }

  // ── Auth: cron token o JWT admin ────────────────────────────────────────
  const cronHeader = req.headers.get("x-cron-token");
  const isCron = cronHeader && CRON_TOKEN && cronHeader === CRON_TOKEN;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let dispatchedBy: string | null = null;

  if (!isCron) {
    // Validar JWT y permiso admin
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing auth" }, 401);

    const { data: userData, error: uErr } = await sb.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Invalid token" }, 401);

    const { data: roleRow } = await (sb as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const isAdmin = roleRow?.role && ["admin", "manager", "owner"].includes(roleRow.role);
    if (!isAdmin) return json({ error: "Forbidden: admin/manager only" }, 403);

    dispatchedBy = userData.user.id;
  }

  // ── Parse body (opcional: force=true para saltar rate-limit) ───────────
  let body: { force?: boolean; max_creators?: number; only_handles?: string[] } = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch (_) { /* ignore */ }

  // ── Rate-limit: no más de 1 run/día ─────────────────────────────────────
  if (!body.force) {
    const { data: already } = await (sb as any).rpc("promolog_dispatched_today", {
      p_tenant_id: TENANT_ID,
    });
    if (already === true) {
      return json({
        skipped: true,
        reason: "Already dispatched today (Miami timezone). Use force=true to override.",
      });
    }
  }

  // ── Query elegibles ─────────────────────────────────────────────────────
  let query = (sb as any)
    .from("v_promolog_eligible_creators")
    .select("id, instagram_handle, name, artistic_name, onlyfans_url");

  if (body.only_handles && Array.isArray(body.only_handles) && body.only_handles.length > 0) {
    query = query.in("instagram_handle", body.only_handles);
  }

  const { data: creators, error: cErr } = await query;
  if (cErr) return json({ error: `Query failed: ${cErr.message}` }, 500);
  if (!creators || creators.length === 0) {
    return json({ skipped: true, reason: "No eligible creators" });
  }

  const limit = body.max_creators && body.max_creators > 0 && body.max_creators <= MAX_CREATORS_PER_RUN
    ? body.max_creators
    : MAX_CREATORS_PER_RUN;
  const batch = (creators as any[]).slice(0, limit);

  // ── Crear dispatch_run row ──────────────────────────────────────────────
  const directUrls = batch.map((c) => `https://www.instagram.com/${normalizeHandle(c.instagram_handle)}/`);

  const apifyInput = {
    directUrls,
    resultsType: "stories",
    resultsLimit: 200,                  // hasta 200 stories total
    addParentData: false,
    searchType: "user",
    searchLimit: 1,
    enhanceUserSearchWithFacebookPage: false,
  };

  const { data: run, error: rErr } = await (sb as any)
    .from("promolog_dispatch_runs")
    .insert({
      tenant_id: TENANT_ID,
      apify_actor_id: APIFY_ACTOR_ID,
      status: "pending",
      creators_count: batch.length,
      dispatched_by: dispatchedBy,
      payload: { input: apifyInput, creator_ids: batch.map((c) => c.id) },
    })
    .select("id")
    .single();

  if (rErr || !run) return json({ error: `Insert dispatch_run failed: ${rErr?.message}` }, 500);

  const runId = run.id as string;

  // ── Lanzar Apify ────────────────────────────────────────────────────────
  // Webhook: cuando el actor termine, Apify hace POST a promolog-webhook
  // con el runId nuestro en eventData para correlacionar.
  const webhookUrl = `${SUPABASE_URL}/functions/v1/promolog-webhook?dispatch_run_id=${runId}`;

  // Webhook config: dispara para SUCCEEDED + FAILED + TIMED_OUT.
  //
  // SECURITY: Supabase Edge Functions con verify_jwt=true requieren
  // un Bearer token válido. Apify no es un cliente Supabase, así que le
  // pasamos el ANON key en headersTemplate. El anon key es público
  // (vive en el frontend bundle) y por sí solo no autoriza nada al
  // service role. La auth real del webhook es la doble validación:
  //   1) dispatch_run_id en query string debe existir en DB
  //   2) apify_run_id en body debe coincidir con lo que guardamos
  // Cualquiera con el anon key Y un dispatch_run_id válido Y el
  // apify_run_id correcto puede hitearlo — el set de quien sabe los 3
  // es esencialmente Apify mismo.
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
        dispatch_run_id: runId,
      }),
    },
  ];

  // Webhooks ad-hoc en Apify se pasan en query string como `webhooks=<base64url>`.
  // Si los mandás dentro del body junto con el input, Apify los pone en el
  // input del actor (que los ignora). Y atención: Apify espera **base64url**
  // (URL-safe), no base64 estándar. Hay que reemplazar `+→-`, `/→_` y
  // remover el padding `=`. Sin esto, Apify silenciosamente no engancha
  // los webhooks (count=0 en el run resultante).
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
      // Sólo apifyInput — los webhooks van en query string (ver arriba).
      body: JSON.stringify(apifyInput),
    });
    const data = await resp.json();
    if (!resp.ok) {
      apifyErr = `Apify ${resp.status}: ${JSON.stringify(data)}`;
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
      .from("promolog_dispatch_runs")
      .update({
        status: "failed",
        error: apifyErr,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return json({ error: apifyErr, dispatch_run_id: runId }, 502);
  }

  await (sb as any)
    .from("promolog_dispatch_runs")
    .update({ status: "running", apify_run_id: apifyRunId })
    .eq("id", runId);

  return json({
    ok: true,
    dispatch_run_id: runId,
    apify_run_id: apifyRunId,
    creators_dispatched: batch.length,
    actor: APIFY_ACTOR_ID,
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────
function normalizeHandle(h: string): string {
  // Acepta tres formatos en `creators.instagram_handle`:
  //   1) "handle"                       → "handle"
  //   2) "@handle"                      → "handle"
  //   3) "https://www.instagram.com/handle/" → "handle"
  const raw = String(h).trim().replace(/^@/, "");
  // Si parece URL, extrae el path final non-vacío
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
