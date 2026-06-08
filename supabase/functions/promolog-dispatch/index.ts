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

// Actor de Apify para Instagram STORIES EN VIVO (24h). Requiere sesión
// autenticada: sessionCookie = el `sessionid` de una cuenta de IG que siga a
// las creadoras (o que sean públicas). El actor sin login solo veía highlights
// viejos (fechas de años atrás) — por eso migramos a este. includeHighlights:
// false → solo las stories del día. Doc:
// https://apify.com/automation-lab/instagram-stories-scraper
const APIFY_ACTOR_ID = "automation-lab~instagram-stories-scraper";

// Tope total de creadoras por invocación del dispatch (la flota completa hoy
// son ~97). El batch se reparte en lotes de CREATORS_PER_APIFY_RUN.
const MAX_CREATORS_PER_DISPATCH = 100;

// Creadoras por Apify run (= por invocación del webhook). El webhook procesa
// todas las stories del run en una invocación; el tope que importa es
// MAX_STORIES_PER_CREATOR (20) en el webhook: peor caso = lote × 20 stories.
// Con el actor logueado cada creadora trae pocas stories en vivo (~3-5), pero
// dimensionamos por el peor caso para no volver a tirar HTTP 546:
//   12 × 20 = 240 stories ≈ ~2.4 min de webhook (vs 8×20=160 ya probado OK).
// 12 mantiene margen y reduce run-starts (cada uno cuesta $0.005 en Apify):
// 97 creadoras → ~9 runs en vez de 13. El ahorro es chico; el grande lo dio el
// cambio al actor logueado (stories en vivo, no posts). Tuneable.
const CREATORS_PER_APIFY_RUN = 12;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN");
  // sessionid de IG para el actor de stories autenticado (lo carga el admin
  // como secret; nunca se loguea/extrae desde el código).
  const IG_SESSION = Deno.env.get("IG_SESSION_COOKIE");

  if (!APIFY_TOKEN) {
    return json({ error: "APIFY_TOKEN not configured" }, 500);
  }
  if (!IG_SESSION) {
    return json({ error: "IG_SESSION_COOKIE not configured (sessionid de IG para stories en vivo)" }, 500);
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

  const limit = body.max_creators && body.max_creators > 0 && body.max_creators <= MAX_CREATORS_PER_DISPATCH
    ? body.max_creators
    : MAX_CREATORS_PER_DISPATCH;
  const batch = (creators as any[]).slice(0, limit);

  // ── Multi-cuenta: cuentas IG EXTRA por creadora ─────────────────────────
  // Cada modelo puede tener varias cuentas de IG. El handle principal vive en
  // creators.instagram_handle; las adicionales en creator_social_accounts.
  // El bot escanea principal + extras activas (el webhook mapea cualquier
  // username de vuelta a la misma creadora → la dedup colapsa a 1 fila/día).
  const batchIds = batch.map((c: any) => c.id);
  const extraByCreator = new Map<string, string[]>();
  if (batchIds.length) {
    const { data: extra } = await (sb as any)
      .from("creator_social_accounts")
      .select("creator_id, username")
      .eq("network", "instagram")
      .eq("active", true)
      .in("creator_id", batchIds);
    for (const a of (extra ?? []) as Array<{ creator_id: string; username: string }>) {
      const arr = extraByCreator.get(a.creator_id) ?? [];
      arr.push(a.username);
      extraByCreator.set(a.creator_id, arr);
    }
  }
  for (const c of batch as any[]) {
    c.extra_usernames = extraByCreator.get(c.id) ?? [];
  }

  // ── Partir en lotes y lanzar un Apify run por lote ──────────────────────
  // Un Apify run = una invocación del webhook. Lotes chicos para que el
  // webhook nunca procese demasiadas stories de una (ver CREATORS_PER_APIFY_RUN).
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

  const chunks: any[][] = [];
  for (let i = 0; i < batch.length; i += CREATORS_PER_APIFY_RUN) {
    chunks.push(batch.slice(i, i + CREATORS_PER_APIFY_RUN));
  }

  const results: ChunkResult[] = [];
  for (const chunk of chunks) {
    results.push(await launchChunk(sb, chunk, { SUPABASE_URL, ANON_KEY, APIFY_TOKEN, IG_SESSION, dispatchedBy }));
  }

  const launched = results.filter((r) => r.apify_run_id);
  const failedRuns = results.filter((r) => r.error);

  return json(
    {
      ok: launched.length > 0,
      runs: results.length,
      runs_launched: launched.length,
      runs_failed: failedRuns.length,
      creators_dispatched: launched.reduce((n, r) => n + r.creators, 0),
      chunk_size: CREATORS_PER_APIFY_RUN,
      actor: APIFY_ACTOR_ID,
      dispatch_run_ids: results.map((r) => r.dispatch_run_id).filter(Boolean),
      ...(failedRuns.length ? { errors: failedRuns.map((r) => r.error) } : {}),
    },
    launched.length === 0 ? 502 : 200,
  );
});

// ─── helpers ──────────────────────────────────────────────────────────────

interface ChunkResult {
  dispatch_run_id: string | null;
  apify_run_id: string | null;
  creators: number;
  error: string | null;
}

// launchChunk — crea un dispatch_run y lanza UN Apify run para un lote de
// creadoras, con su propio webhook (correlacionado por dispatch_run_id). Cada
// lote = una invocación del webhook, así ninguna supera el límite de recursos
// de la Edge Function (HTTP 546). Best-effort: si Apify falla, marca el row
// failed y devuelve el error sin abortar los demás lotes.
//
// SECURITY (igual que antes): pasamos el ANON key público a Apify en el
// header; la auth real del webhook es la doble validación dispatch_run_id +
// apify_run_id. Apify espera el webhook en base64url en el query string.
async function launchChunk(
  sb: any,
  chunk: any[],
  env: { SUPABASE_URL: string; ANON_KEY: string; APIFY_TOKEN: string; IG_SESSION: string; dispatchedBy: string | null },
): Promise<ChunkResult> {
  // Input del actor automation-lab/instagram-stories-scraper:
  //   usernames: handles sin @  ·  sessionCookie: el sessionid de IG
  //   includeHighlights:false → solo stories en vivo (no highlights viejos)
  // Proxy residencial para reducir bloqueos de IG.
  const apifyInput = {
    // principal + cuentas extra activas, deduplicado y normalizado.
    usernames: [
      ...new Set(
        chunk
          .flatMap((c) => [c.instagram_handle, ...(c.extra_usernames ?? [])])
          .map((h) => normalizeHandle(h))
          .filter(Boolean),
      ),
    ],
    sessionCookie: env.IG_SESSION,
    includeHighlights: false,
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
  };

  const { data: run, error: rErr } = await (sb as any)
    .from("promolog_dispatch_runs")
    .insert({
      tenant_id: TENANT_ID,
      apify_actor_id: APIFY_ACTOR_ID,
      status: "pending",
      creators_count: chunk.length,
      dispatched_by: env.dispatchedBy,
      payload: { input: apifyInput, creator_ids: chunk.map((c) => c.id) },
    })
    .select("id")
    .single();

  if (rErr || !run) {
    return { dispatch_run_id: null, apify_run_id: null, creators: chunk.length, error: `insert_run: ${rErr?.message}` };
  }
  const runId = run.id as string;

  const webhookUrl = `${env.SUPABASE_URL}/functions/v1/promolog-webhook?dispatch_run_id=${runId}`;
  const webhooks = [
    {
      eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
      requestUrl: webhookUrl,
      headersTemplate: JSON.stringify({
        Authorization: `Bearer ${env.ANON_KEY}`,
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
  const webhooksB64 = btoa(JSON.stringify(webhooks))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const apifyUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs?token=${env.APIFY_TOKEN}&webhooks=${webhooksB64}`;

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

  if (apifyErr) {
    await (sb as any)
      .from("promolog_dispatch_runs")
      .update({ status: "failed", error: apifyErr, finished_at: new Date().toISOString() })
      .eq("id", runId);
    return { dispatch_run_id: runId, apify_run_id: null, creators: chunk.length, error: apifyErr };
  }

  await (sb as any)
    .from("promolog_dispatch_runs")
    .update({ status: "running", apify_run_id: apifyRunId })
    .eq("id", runId);
  return { dispatch_run_id: runId, apify_run_id: apifyRunId, creators: chunk.length, error: null };
}

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
