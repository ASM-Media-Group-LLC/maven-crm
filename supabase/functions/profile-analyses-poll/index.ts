import { corsFor } from "../_shared/cors.ts";
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

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token" });

// Solo destrancamos jobs que llevan al menos 2 min "running"
const MIN_RUNNING_MINUTES = 2;
// Max jobs por tick para no timeout si hay backlog
const MAX_JOBS_PER_TICK = 10;
// Deadline duro SOLO para promolog_handle_check_jobs (chequeos pedidos por el
// bot vía check_ig_handles): pasados estos minutos sin resolver, el job se marca
// failed y el grupo recibe el aviso — el equipo nunca espera una respuesta que
// no llega. NO aplicar a profile_analyses: ese flujo ya corre sin deadline y
// cambiárselo altera comportamiento que el equipo usa hoy (decisión 31/07).
const HANDLE_CHECK_DEADLINE_MINUTES = 10;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

  if (!APIFY_TOKEN) return json(req, { error: "APIFY_TOKEN not configured" }, 500);

  // Auth: solo cron interno
  const cronHeader = req.headers.get("x-cron-token");
  if (!CRON_TOKEN || cronHeader !== CRON_TOKEN) {
    return json(req, { error: "Forbidden: cron token required" }, 403);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 2) promolog_handle_check_jobs — chequeos de handles del bot ─────────
  // Mismo fallback (webhook perdido → poll Apify → re-fire del callback) +
  // deadline duro. Corre ANTES del early-return de profile_analyses para que
  // "no hay análisis stuck" no saltee este barrido.
  const cutoff = new Date(Date.now() - MIN_RUNNING_MINUTES * 60_000).toISOString();
  const hcResults = await sweepHandleCheckJobs(sb, cutoff, { SUPABASE_URL, APIFY_TOKEN, CRON_TOKEN, ANON_KEY });
  // ── 3) parrilla_trending_jobs — reels en tendencia del bot de Managers ───
  // Mismo patrón (webhook perdido → poll Apify → re-fire del callback + deadline).
  const trResults = await sweepTrendingJobs(sb, cutoff, { SUPABASE_URL, APIFY_TOKEN, CRON_TOKEN, ANON_KEY });

  // Query jobs candidatos
  const { data: stuckJobs, error: qErr } = await (sb as any)
    .from("profile_analyses")
    .select("id, apify_run_id, created_at")
    .eq("status", "running")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_TICK);

  if (qErr) return json(req, { error: `query failed: ${qErr.message}`, handle_checks: hcResults, trending: trResults }, 500);
  if (!stuckJobs || stuckJobs.length === 0) {
    return json(req, { ok: true, processed: 0, message: "No stuck jobs", handle_checks: hcResults, trending: trResults });
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

  return json(req, { ok: true, processed: results.length, results, handle_checks: hcResults, trending: trResults });
});

// Barre parrilla_trending_jobs no terminales (reels en tendencia, edge
// parrilla-refs-trending). Misma lógica que sweepHandleCheckJobs: deadline duro
// con aviso al grupo (claim atómico) y re-fire del callback si el webhook se perdió.
const TRENDING_DEADLINE_MINUTES = 12;
async function sweepTrendingJobs(
  sb: any,
  cutoff: string,
  env: { SUPABASE_URL: string; APIFY_TOKEN: string; CRON_TOKEN: string | undefined; ANON_KEY: string },
): Promise<Array<{ job_id: string; action: string }>> {
  const out: Array<{ job_id: string; action: string }> = [];
  const { data: jobs, error } = await sb
    .from("parrilla_trending_jobs")
    .select("id, status, apify_run_id, group_id, requested_by, created_at")
    .in("status", ["pending", "running", "processing"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_TICK);
  if (error) return [{ job_id: "—", action: `query_failed: ${error.message}` }];

  for (const job of (jobs ?? []) as any[]) {
    const ageMin = (Date.now() - new Date(job.created_at).getTime()) / 60_000;
    if (ageMin > TRENDING_DEADLINE_MINUTES) {
      const { data: claimed } = await sb
        .from("parrilla_trending_jobs")
        .update({ status: "failed", error: `deadline_${TRENDING_DEADLINE_MINUTES}min`, completed_at: new Date().toISOString() })
        .eq("id", job.id)
        .in("status", ["pending", "running", "processing"])
        .select("id");
      if (!claimed || claimed.length === 0) { out.push({ job_id: job.id, action: "deadline_race_lost" }); continue; }
      const quien = job.requested_by ? ` ${job.requested_by},` : "";
      try {
        await fetch(`${env.SUPABASE_URL}/functions/v1/whatsapp-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Cron-Token": env.CRON_TOKEN ?? "" },
          body: JSON.stringify({ group_id: job.group_id, body: `⚠️${quien} no pude armar el listado de reels en tendencia — el scraper no respondió a tiempo. Pídemelo de nuevo en unos minutos.` }),
        });
        out.push({ job_id: job.id, action: "deadline_failed_notified" });
      } catch (e) {
        out.push({ job_id: job.id, action: `deadline_notify_error: ${(e as Error).message.slice(0, 40)}` });
      }
      continue;
    }
    if (job.status !== "running" || !job.apify_run_id) { out.push({ job_id: job.id, action: "waiting" }); continue; }
    try {
      const resp = await fetch(`https://api.apify.com/v2/actor-runs/${job.apify_run_id}?token=${env.APIFY_TOKEN}`);
      if (!resp.ok) { out.push({ job_id: job.id, action: `apify_${resp.status}` }); continue; }
      const data = await resp.json();
      const st = String(data?.data?.status ?? "unknown");
      if (st === "READY" || st === "RUNNING") { out.push({ job_id: job.id, action: "still_running" }); continue; }
      const cbResp = await fetch(`${env.SUPABASE_URL}/functions/v1/parrilla-refs-trending?cb=1&job_id=${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.ANON_KEY}` },
        body: JSON.stringify({ runId: job.apify_run_id, status: st, defaultDatasetId: data?.data?.defaultDatasetId ?? null, job_id: job.id }),
      });
      out.push({ job_id: job.id, action: cbResp.ok ? "callback_triggered" : `callback_failed_${cbResp.status}` });
    } catch (e) {
      out.push({ job_id: job.id, action: `error: ${(e as Error).message.slice(0, 40)}` });
    }
  }
  return out;
}

// Barre promolog_handle_check_jobs no terminales:
//   - >HANDLE_CHECK_DEADLINE_MINUTES → failed + aviso al grupo (claim atómico:
//     el UPDATE condicional evita duplicar el aviso si el callback gana la carrera).
//   - 'running' con >2 min → consulta Apify; si el run terminó, re-dispara el
//     callback de promolog-handle-check con status/datasetId reales (el callback
//     es idempotente por su propio claim running→processing).
//   - 'pending'/'processing' jóvenes → esperar (los resuelve el deadline si se colgaron).
async function sweepHandleCheckJobs(
  sb: any,
  cutoff: string,
  env: { SUPABASE_URL: string; APIFY_TOKEN: string; CRON_TOKEN: string | undefined; ANON_KEY: string },
): Promise<Array<{ job_id: string; action: string }>> {
  const out: Array<{ job_id: string; action: string }> = [];
  const { data: jobs, error } = await sb
    .from("promolog_handle_check_jobs")
    .select("id, status, apify_run_id, group_id, requested_by, handles, created_at")
    .in("status", ["pending", "running", "processing"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_TICK);
  if (error) return [{ job_id: "—", action: `query_failed: ${error.message}` }];

  for (const job of (jobs ?? []) as any[]) {
    const ageMin = (Date.now() - new Date(job.created_at).getTime()) / 60_000;

    if (ageMin > HANDLE_CHECK_DEADLINE_MINUTES) {
      const { data: claimed } = await sb
        .from("promolog_handle_check_jobs")
        .update({ status: "failed", error: `deadline_${HANDLE_CHECK_DEADLINE_MINUTES}min`, completed_at: new Date().toISOString() })
        .eq("id", job.id)
        .in("status", ["pending", "running", "processing"])
        .select("id");
      if (!claimed || claimed.length === 0) {
        out.push({ job_id: job.id, action: "deadline_race_lost" });
        continue;
      }
      const handles: string[] = Array.isArray(job.handles) ? job.handles : [];
      const quien = job.requested_by ? ` ${job.requested_by},` : "";
      const body = `⚠️${quien} no pude completar el chequeo de ${handles.map((h) => `@${h}`).join(", ")} — el scraper no respondió a tiempo. Reintentá pidiéndomelo de nuevo en unos minutos.`;
      try {
        await fetch(`${env.SUPABASE_URL}/functions/v1/whatsapp-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Cron-Token": env.CRON_TOKEN ?? "" },
          body: JSON.stringify({ group_id: job.group_id, body }),
        });
        out.push({ job_id: job.id, action: "deadline_failed_notified" });
      } catch (e) {
        out.push({ job_id: job.id, action: `deadline_notify_error: ${(e as Error).message.slice(0, 40)}` });
      }
      continue;
    }

    if (job.status !== "running" || !job.apify_run_id) {
      out.push({ job_id: job.id, action: "waiting" });
      continue;
    }

    try {
      const resp = await fetch(`https://api.apify.com/v2/actor-runs/${job.apify_run_id}?token=${env.APIFY_TOKEN}`);
      if (!resp.ok) {
        out.push({ job_id: job.id, action: `apify_${resp.status}` });
        continue;
      }
      const data = await resp.json();
      const st = String(data?.data?.status ?? "unknown");
      if (st === "READY" || st === "RUNNING") {
        out.push({ job_id: job.id, action: "still_running" });
        continue;
      }
      const cbResp = await fetch(`${env.SUPABASE_URL}/functions/v1/promolog-handle-check?cb=1&job_id=${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.ANON_KEY}` },
        body: JSON.stringify({
          runId: job.apify_run_id,
          status: st,
          defaultDatasetId: data?.data?.defaultDatasetId ?? null,
          job_id: job.id,
        }),
      });
      out.push({ job_id: job.id, action: cbResp.ok ? "callback_triggered" : `callback_failed_${cbResp.status}` });
    } catch (e) {
      out.push({ job_id: job.id, action: `error: ${(e as Error).message.slice(0, 40)}` });
    }
  }
  return out;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
