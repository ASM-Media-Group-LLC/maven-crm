// promolog-poll — cron job de fallback que destranca dispatch_runs
// que quedaron en "running" porque el webhook de Apify no se disparó.
//
// Por qué existe este fix:
//   El actor `apify/instagram-scraper` debería llamar nuestro webhook
//   cuando termina (config en query string `?webhooks=<b64>`), pero en
//   la práctica Apify NO está enganchando los webhooks ad-hoc — siempre
//   devuelve `webhooks: []` en el GET del run. No encontramos por qué
//   (probamos base64 estándar y base64url, sin diferencia). Mientras
//   investigamos, este polling es la red de seguridad: cada 5 min mira
//   dispatch_runs en "running" desde hace más de 2 min, consulta Apify
//   sobre el estado del run, y si terminó dispara manualmente el webhook
//   con el dataset id correcto.
//
// El webhook ya es idempotente (chequea `status` antes de procesar), así
// que si por casualidad Apify SI disparó el callback, no procesamos dos
// veces.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};

// Solo destrancamos runs que llevan al menos 2 min "running" — los más
// nuevos pueden estar legítimamente trabajando.
const MIN_RUNNING_MINUTES = 2;
// Máximo de runs que procesamos por tick. Si hay más, el siguiente tick
// (5 min después) los toma. Esto evita timeout si hay backlog.
const MAX_RUNS_PER_TICK = 5;

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

  // Auth: este endpoint solo lo llama pg_cron — validamos el token
  // interno. No exponemos al frontend.
  const cronHeader = req.headers.get("x-cron-token");
  if (!CRON_TOKEN || cronHeader !== CRON_TOKEN) {
    return json({ error: "Forbidden: cron token required" }, 403);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Query runs candidatos ───────────────────────────────────────────────
  const cutoff = new Date(Date.now() - MIN_RUNNING_MINUTES * 60_000).toISOString();
  const { data: stuckRuns, error: qErr } = await (sb as any)
    .from("promolog_dispatch_runs")
    .select("id, apify_run_id, started_at, payload, retry_count")
    .eq("status", "running")
    .lt("started_at", cutoff)
    .order("started_at", { ascending: true })
    .limit(MAX_RUNS_PER_TICK);

  if (qErr) return json({ error: `query failed: ${qErr.message}` }, 500);
  if (!stuckRuns || stuckRuns.length === 0) {
    return json({ ok: true, processed: 0, message: "No stuck runs" });
  }

  // ── Procesar cada run: consultar Apify, si terminó disparar webhook ─────
  const results: Array<{ dispatch_run_id: string; apify_status: string; action: string }> = [];

  for (const run of stuckRuns as any[]) {
    const dispatchRunId = run.id as string;
    const apifyRunId = run.apify_run_id as string | null;

    if (!apifyRunId) {
      // Esto no debería pasar — un run "running" siempre debería tener apify_run_id
      results.push({ dispatch_run_id: dispatchRunId, apify_status: "—", action: "no_apify_id" });
      continue;
    }

    // Consultar estado en Apify
    let apifyStatus = "unknown";
    let datasetId: string | null = null;
    try {
      const resp = await fetch(`https://api.apify.com/v2/actor-runs/${apifyRunId}?token=${APIFY_TOKEN}`);
      if (!resp.ok) {
        results.push({ dispatch_run_id: dispatchRunId, apify_status: `apify_${resp.status}`, action: "skipped" });
        continue;
      }
      const data = await resp.json();
      apifyStatus = String(data?.data?.status ?? "unknown");
      datasetId = data?.data?.defaultDatasetId ?? null;
    } catch (e) {
      results.push({ dispatch_run_id: dispatchRunId, apify_status: `fetch_error:${(e as Error).message.slice(0, 40)}`, action: "skipped" });
      continue;
    }

    // Si Apify aún está corriendo, dejamos el dispatch en "running" y
    // esperamos al próximo tick.
    if (apifyStatus === "READY" || apifyStatus === "RUNNING") {
      results.push({ dispatch_run_id: dispatchRunId, apify_status: apifyStatus, action: "still_running" });
      continue;
    }

    // Estados terminales: SUCCEEDED, FAILED, TIMED-OUT, ABORTED
    // → disparar el webhook con el body correcto.
    try {
      const webhookResp = await fetch(`${SUPABASE_URL}/functions/v1/promolog-webhook?dispatch_run_id=${dispatchRunId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          runId: apifyRunId,
          status: apifyStatus,
          defaultDatasetId: datasetId,
          dispatch_run_id: dispatchRunId,
        }),
      });
      let action = webhookResp.ok ? "webhook_triggered" : `webhook_failed_${webhookResp.status}`;
      // Reintento automático: si Apify NO terminó OK (TIMED-OUT/FAILED/ABORTED) y este run
      // no es ya un reintento, re-despachar UNA vez las creadoras que quedaron sin entry hoy.
      if (webhookResp.ok && apifyStatus !== "SUCCEEDED" && (run.retry_count ?? 0) === 0) {
        const n = await retryFallen(sb, run, { SUPABASE_URL, ANON_KEY, CRON_TOKEN });
        if (n > 0) action += `+retry(${n})`;
      }
      results.push({ dispatch_run_id: dispatchRunId, apify_status: apifyStatus, action });
    } catch (e) {
      results.push({ dispatch_run_id: dispatchRunId, apify_status: apifyStatus, action: `webhook_error:${(e as Error).message.slice(0, 40)}` });
    }
  }

  return json({ ok: true, processed: results.length, results });
});

// retryFallen — re-despacha UNA vez las creadoras de un run terminal (timeout/failed)
// que quedaron SIN entry hoy. Mapea creator_ids → instagram_handle por la vista de
// elegibles (1:1 y solo activas; el payload.input.usernames está deduplicado/mezclado
// con cuentas extra, no sirve para mapear). Marca el run con retry_count=1 (anti-loop).
async function retryFallen(
  // deno-lint-ignore no-explicit-any
  sb: any,
  // deno-lint-ignore no-explicit-any
  run: any,
  env: { SUPABASE_URL: string; ANON_KEY: string; CRON_TOKEN: string | undefined },
): Promise<number> {
  const ids: string[] = run.payload?.creator_ids ?? [];
  if (!ids.length || !env.CRON_TOKEN) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const { data: ent } = await sb
    .from("promolog_entries")
    .select("creator_id")
    .in("creator_id", ids)
    .gte("date", today);
  const have = new Set((ent ?? []).map((e: { creator_id: string | null }) => e.creator_id).filter(Boolean));
  const missingIds = ids.filter((id) => !have.has(id));
  if (!missingIds.length) return 0;

  const { data: cr } = await sb
    .from("v_promolog_eligible_creators")
    .select("id, instagram_handle")
    .in("id", missingIds);
  const handles = [...new Set((cr ?? []).map((c: { instagram_handle: string | null }) => c.instagram_handle).filter(Boolean))];
  if (!handles.length) return 0;

  try {
    await fetch(`${env.SUPABASE_URL}/functions/v1/promolog-dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.ANON_KEY}`,
        "x-cron-token": env.CRON_TOKEN,
      },
      body: JSON.stringify({ force: true, only_handles: handles, retry_of: run.id }),
    });
    // Marcar el original como reintentado (no se vuelve a reintentar).
    await sb.from("promolog_dispatch_runs").update({ retry_count: 1 }).eq("id", run.id);
  } catch (_) { /* best-effort: si falla, el próximo tick NO reintenta (sigue retry_count=0) */ }

  return (handles as string[]).length;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
