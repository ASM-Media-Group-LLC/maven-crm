// profile-analyses-poll — cron job de fallback que destranca jobs de
// profile_analyses que quedaron en "running" porque Apify no disparó
// el webhook (o lo disparó mal).
//
// Por qué existe: el actor apify/instagram-scraper a veces NO engancha
// los webhooks ad-hoc — el callback nunca llega o llega con placeholders
// sin sustituir. promolog tiene el mismo bug y por eso existe promolog-poll.
//
// Este poll cada 1-2 min:
//   1. Lee profile_analyses con status='running' viejos (>2 min)
//   2. Para cada uno, GET a Apify API con el apify_run_id
//   3. Si Apify dice SUCCEEDED/FAILED → invoca scrape-profile-deep-callback
//      manualmente con el body correcto (status real + datasetId real)
//   4. El callback es idempotente, no procesa 2 veces

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};

// Solo destrancamos jobs que llevan al menos 2 min "running"
const MIN_RUNNING_MINUTES = 2;
// Max jobs por tick para no timeout si hay backlog
const MAX_JOBS_PER_TICK = 10;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

  if (!APIFY_TOKEN) return json({ error: "APIFY_TOKEN not configured" }, 500);

  // Auth: solo cron interno
  const cronHeader = req.headers.get("x-cron-token");
  if (!CRON_TOKEN || cronHeader !== CRON_TOKEN) {
    return json({ error: "Forbidden: cron token required" }, 403);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Query jobs candidatos
  const cutoff = new Date(Date.now() - MIN_RUNNING_MINUTES * 60_000).toISOString();
  const { data: stuckJobs, error: qErr } = await (sb as any)
    .from("profile_analyses")
    .select("id, apify_run_id, created_at")
    .eq("status", "running")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_TICK);

  if (qErr) return json({ error: `query failed: ${qErr.message}` }, 500);
  if (!stuckJobs || stuckJobs.length === 0) {
    return json({ ok: true, processed: 0, message: "No stuck jobs" });
  }

  // Procesar cada job: consultar Apify, si terminó disparar callback
  const results: Array<{ job_id: string; apify_status: string; action: string }> = [];

  for (const job of stuckJobs as any[]) {
    const jobId = job.id as string;
    const apifyRunId = job.apify_run_id as string | null;

    if (!apifyRunId) {
      results.push({ job_id: jobId, apify_status: "—", action: "no_apify_id" });
      continue;
    }

    // Consultar Apify
    let apifyStatus = "unknown";
    let datasetId: string | null = null;
    try {
      const resp = await fetch(`https://api.apify.com/v2/actor-runs/${apifyRunId}?token=${APIFY_TOKEN}`);
      if (!resp.ok) {
        results.push({ job_id: jobId, apify_status: `apify_${resp.status}`, action: "skipped" });
        continue;
      }
      const data = await resp.json();
      apifyStatus = String(data?.data?.status ?? "unknown");
      datasetId = data?.data?.defaultDatasetId ?? null;
    } catch (e) {
      results.push({ job_id: jobId, apify_status: `fetch_error:${(e as Error).message.slice(0, 40)}`, action: "skipped" });
      continue;
    }

    // Si aún corriendo, esperamos al próximo tick
    if (apifyStatus === "READY" || apifyStatus === "RUNNING") {
      results.push({ job_id: jobId, apify_status: apifyStatus, action: "still_running" });
      continue;
    }

    // Estados terminales: disparar el callback con datos correctos
    try {
      const webhookResp = await fetch(
        `${SUPABASE_URL}/functions/v1/scrape-profile-deep-callback?job_id=${jobId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ANON_KEY}`,
          },
          body: JSON.stringify({
            runId: apifyRunId,
            status: apifyStatus,
            defaultDatasetId: datasetId,
            job_id: jobId,
          }),
        },
      );
      const action = webhookResp.ok ? "callback_triggered" : `callback_failed_${webhookResp.status}`;
      results.push({ job_id: jobId, apify_status: apifyStatus, action });
    } catch (e) {
      results.push({ job_id: jobId, apify_status: apifyStatus, action: `callback_error:${(e as Error).message.slice(0, 40)}` });
    }
  }

  return json({ ok: true, processed: results.length, results });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
