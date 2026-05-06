// @supabase-functions-cron-schedule: 0 6 * * *
// scouter-generate-tasks — genera 50 asignaciones diarias por spammer usando Groq.
//
// POST body: { tenant_id: string, spammer_id?: string }
//   - Si se omite spammer_id, genera para TODOS los spammers activos del tenant.
//   - Auth: requiere header Authorization con service_role key o JWT de admin.
//
// Flujo:
//   1. Validar request + auth header.
//   2. Obtener spammers activos del tenant (o el spammer_id específico).
//   3. Para cada spammer:
//      a. Consultar sus cuentas de Instagram (scouter_spammer_accounts).
//      b. Rankear leads con scoring SQL compuesto (ai_score, recency, cooldown).
//      c. Dividir en batches de 10 y llamar a Groq llama-3.3-70b-versatile.
//      d. Parsear respuesta JSON e insertar scouter_daily_assignments + scouter_interaction_tasks.
//   4. Retornar resumen con totales.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildSystemPrompt, buildUserMessage, type LeadForPrompt, type SpammerAccount } from "./prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GROQ_URL =
  Deno.env.get("GROQ_BASE_URL") || "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const BATCH_SIZE_DEFAULT = 50;
const CHUNK_SIZE = 10; // leads per Groq call
const COOLDOWN_DAYS_DEFAULT = 3;
// Si un spammer arrastra ≥ este número de assignments pending tras el
// rollover, no le generamos NADA nuevo hoy. Forzamos que cierre backlog
// antes de seguir recibiendo. Ajustable vía body.backlog_cap.
const BACKLOG_CAP_DEFAULT = 30;

interface GenerateRequest {
  tenant_id: string;
  spammer_id?: string;
  cooldown_days?: number;
  batch_size?: number;
  backlog_cap?: number;
}

interface RankedLead {
  id: string;
  instagram_handle: string;
  ai_score: number | null;
  followers: number | null;
  bio: string | null;
  country: string | null;
  status: string;
  interaction_count: number;
  days_since_assigned: number;
  rank_score: number;
}

interface GroqTask {
  from_account: string;
  type: "follow" | "like" | "comment" | "story_view" | "story_react";
  instruction: string;
  suggested_comment: string | null;
}

interface GroqLeadResult {
  lead_handle: string;
  strategy: string;
  reasoning: string;
  tasks: GroqTask[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ─── Auth check ──────────────────────────────────────────────────────────
    // Acepta tres mecanismos:
    //   1. Authorization: Bearer <service_role JWT>  — uso original
    //   2. Authorization: Bearer <admin JWT>          — botón en Settings
    //   3. X-Cron-Token: <CRON_INTERNAL_TOKEN>        — pg_cron interno
    //
    // El #3 evita exponer el service_role en cron.job (que está en la DB
    // tras vault.decrypted_secrets, complejidad innecesaria). Generamos
    // un UUID propio y lo seteamos via `supabase secrets set
    // CRON_INTERNAL_TOKEN=...`. Si leakea, rotamos el secret y redeploy
    // sin tocar credenciales master.
    const authHeader = req.headers.get("authorization") ?? "";
    const cronTokenHeader = req.headers.get("x-cron-token") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const cronInternalToken = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";

    if (!groqKey) {
      return jsonError("GROQ_API_KEY no configurada en los secrets de Supabase.", 500);
    }

    // Usamos service role para bypasear RLS en queries cross-spammer.
    const supabase = createClient(supabaseUrl, serviceKey);

    const cronTokenValid =
      !!cronInternalToken && cronTokenHeader === cronInternalToken;

    if (!authHeader && !cronTokenValid) {
      return jsonError("Authorization header requerido.", 401);
    }

    // ─── Parse body ──────────────────────────────────────────────────────────
    let body: GenerateRequest;
    try {
      body = await req.json();
    } catch {
      return jsonError("JSON inválido.", 400);
    }

    if (!body.tenant_id?.trim()) {
      return jsonError("tenant_id requerido.", 400);
    }

    const tenantId = body.tenant_id.trim();
    const cooldownDays = body.cooldown_days ?? COOLDOWN_DAYS_DEFAULT;
    const batchSize = body.batch_size ?? BATCH_SIZE_DEFAULT;
    const backlogCap = body.backlog_cap ?? BACKLOG_CAP_DEFAULT;

    // ─── Get spammers ────────────────────────────────────────────────────────
    let spammerIds: string[];
    if (body.spammer_id) {
      spammerIds = [body.spammer_id];
    } else {
      // Todos los spammers que tienen al menos 1 cuenta activa en este tenant.
      const { data: accounts, error: accErr } = await supabase
        .from("scouter_spammer_accounts")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("active", true);
      if (accErr) throw accErr;
      // Deduplicate
      spammerIds = [...new Set((accounts ?? []).map((a: { user_id: string }) => a.user_id as string))];
    }

    if (spammerIds.length === 0) {
      return jsonOk({ message: "No hay spammers activos en este tenant.", assignments_created: 0 });
    }

    // ─── Process each spammer ────────────────────────────────────────────────
    let totalAssignments = 0;
    let totalTasks = 0;
    const errors: string[] = [];

    for (const spammerId of spammerIds) {
      try {
        const { assignments, tasks } = await processSpammer(
          supabase,
          tenantId,
          spammerId,
          cooldownDays,
          batchSize,
          backlogCap,
          groqKey,
        );
        totalAssignments += assignments;
        totalTasks += tasks;
      } catch (e) {
        const msg = (e as Error).message ?? "Error desconocido";
        console.error(`Error procesando spammer ${spammerId}:`, msg);
        errors.push(`spammer ${spammerId}: ${msg}`);
      }
    }

    return jsonOk({
      ok: true,
      spammers_processed: spammerIds.length,
      assignments_created: totalAssignments,
      tasks_created: totalTasks,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error("scouter-generate-tasks error:", e);
    return jsonError((e as Error).message ?? "Error interno.", 500);
  }
});

// ─── Core: process one spammer ────────────────────────────────────────────────

async function processSpammer(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tenantId: string,
  spammerId: string,
  cooldownDays: number,
  batchSize: number,
  backlogCap: number,
  groqKey: string,
): Promise<{ assignments: number; tasks: number }> {
  // 1. Get spammer's IG accounts
  const { data: accounts, error: accErr } = await supabase
    .from("scouter_spammer_accounts")
    .select("id, instagram_handle, followers_count, account_niche, bio")
    .eq("user_id", spammerId)
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (accErr) throw accErr;

  const spammerAccounts: SpammerAccount[] = (accounts ?? []).map((a: SpammerAccount & { id: string }) => ({
    id: a.id,
    instagram_handle: a.instagram_handle,
    followers_count: a.followers_count,
    account_niche: a.account_niche,
    bio: a.bio,
  }));

  if (spammerAccounts.length === 0) {
    console.log(`Spammer ${spammerId} no tiene cuentas activas, saltando.`);
    return { assignments: 0, tasks: 0 };
  }

  // Build account lookup by handle (for resolving from_account to ID)
  const accountByHandle: Record<string, string> = {};
  for (const a of accounts ?? []) {
    accountByHandle[`@${a.instagram_handle}`] = a.id;
    accountByHandle[a.instagram_handle] = a.id;
  }

  // 2. Rollover: si ayer quedaron assignments incompletas (status !=
  // 'done'), las traemos al día de HOY. Eso le garantiza al spammer
  // que sus 50 tareas NO se pierden cuando no las cierra todas — en
  // vez de eso se acumulan al día siguiente y el quota nuevo del día
  // solo cubre la diferencia. Si rollover llena los 50 slots (o más),
  // la generación nueva se acorta o salta.
  const rolledCount = await rolloverPending(supabase, tenantId, spammerId);
  if (rolledCount > 0) {
    console.log(
      `Spammer ${spammerId}: ${rolledCount} assignments incompletas reolladas a hoy.`,
    );
  }

  // Backlog cap (30 default): si tras el rollover el spammer ya tiene
  // ≥ backlogCap assignments pending, no le encolamos más. Tiene que
  // cerrar lo que arrastra antes de recibir leads frescos. Esto evita
  // que un spammer ausente acumule cientos de assignments y la cola
  // pierda señal de qué priorizar.
  if (rolledCount >= backlogCap) {
    console.log(
      `Spammer ${spammerId}: backlog (${rolledCount}) ≥ cap (${backlogCap}), no se generan nuevas hoy.`,
    );
    return { assignments: rolledCount, tasks: 0 };
  }

  // Cuántas assignments NUEVAS hace falta generar para llegar al
  // batchSize objetivo (50 default). Si ya hay rolledCount >= batchSize,
  // no generamos nada nuevo — el spammer arrastra las pendientes.
  const slotsRemaining = Math.max(0, batchSize - rolledCount);
  if (slotsRemaining === 0) {
    console.log(
      `Spammer ${spammerId}: rollover llenó los ${batchSize} slots, sin generar nuevas hoy.`,
    );
    return { assignments: rolledCount, tasks: 0 };
  }

  // 3. Rank leads via SQL scoring query — pasamos spammerId para que la
  // RPC excluya leads ya asignados a OTROS spammers del tenant en los
  // últimos cooldown_days, evitando duplicados cross-spammer.
  const rankedLeads = await rankLeads(supabase, tenantId, spammerId, cooldownDays, slotsRemaining);

  if (rankedLeads.length === 0) {
    console.log(`No hay leads disponibles para tenant ${tenantId} (cooldown: ${cooldownDays}d).`);
    return { assignments: rolledCount, tasks: 0 };
  }

  // 3. Batch Groq calls: 10 leads per call
  const systemPrompt = buildSystemPrompt(spammerAccounts);
  const chunks = chunkArray(rankedLeads, CHUNK_SIZE);
  const groqResults: GroqLeadResult[] = [];

  for (const chunk of chunks) {
    const leadsForPrompt: LeadForPrompt[] = chunk.map((l) => ({
      instagram_handle: l.instagram_handle,
      ai_score: l.ai_score,
      followers: l.followers,
      country: l.country,
      bio: l.bio,
      status: l.status,
      interaction_count: l.interaction_count,
      days_since_assigned: l.days_since_assigned,
    }));
    const userMessage = buildUserMessage(leadsForPrompt);
    const results = await callGroqBatch(groqKey, systemPrompt, userMessage);
    groqResults.push(...results);
  }

  // 4. Write to DB
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  let assignmentsCreated = 0;
  let tasksCreated = 0;

  // Build a map from handle to lead id for quick lookup
  const leadByHandle: Record<string, string> = {};
  for (const l of rankedLeads) {
    leadByHandle[`@${l.instagram_handle}`] = l.id;
    leadByHandle[l.instagram_handle] = l.id;
  }

  for (const result of groqResults) {
    const leadId = leadByHandle[result.lead_handle] ?? leadByHandle[result.lead_handle?.replace(/^@/, "")];
    if (!leadId) {
      console.warn(`Lead no encontrado para handle: ${result.lead_handle}`);
      continue;
    }

    // Find priority from rank_score
    const rankedLead = rankedLeads.find((l) => l.id === leadId);
    const priority = rankedLead
      ? Math.max(1, Math.min(10, Math.round(10 - (rankedLead.rank_score / 100) * 9)))
      : 5;

    // INSERT scouter_daily_assignments ON CONFLICT DO NOTHING
    const { data: assignment, error: assignErr } = await supabase
      .from("scouter_daily_assignments")
      .insert({
        spammer_id: spammerId,
        lead_id: leadId,
        assigned_date: today,
        ai_strategy: result.strategy ?? null,
        ai_reasoning: result.reasoning ?? null,
        priority,
        status: "pending",
        tenant_id: tenantId,
      })
      .select("id")
      .maybeSingle();

    if (assignErr) {
      // ON CONFLICT: if unique violation (spammer_id, lead_id, assigned_date), skip silently.
      if (assignErr.code === "23505") continue;
      console.error("Error insertando assignment:", assignErr);
      continue;
    }
    if (!assignment) continue; // conflicto silencioso
    assignmentsCreated++;

    // INSERT scouter_interaction_tasks (up to 4)
    const tasksToInsert = (result.tasks ?? []).slice(0, 4);
    for (let i = 0; i < tasksToInsert.length; i++) {
      const t = tasksToInsert[i];
      // Resolve from_account_id
      const fromAccountId =
        accountByHandle[t.from_account] ?? accountByHandle[t.from_account?.replace(/^@/, "")];
      if (!fromAccountId) {
        console.warn(`Cuenta de spammer no encontrada: ${t.from_account}`);
        continue;
      }

      const validTypes = ["follow", "like", "comment", "story_view", "story_react"];
      if (!validTypes.includes(t.type)) {
        console.warn(`Tipo de tarea inválido: ${t.type}`);
        continue;
      }

      const { error: taskErr } = await supabase
        .from("scouter_interaction_tasks")
        .insert({
          assignment_id: assignment.id,
          from_account_id: fromAccountId,
          task_type: t.type,
          instruction: t.instruction ?? "",
          suggested_comment: t.type === "comment" ? (t.suggested_comment ?? null) : null,
          sort_order: i,
          status: "pending",
          tenant_id: tenantId,
        })
        .select("id")
        .maybeSingle();

      if (taskErr) {
        if (taskErr.code === "23505") continue; // ON CONFLICT DO NOTHING
        console.error("Error insertando tarea:", taskErr);
        continue;
      }
      tasksCreated++;
    }
  }

  return { assignments: assignmentsCreated, tasks: tasksCreated };
}

// ─── Lead ranking query ───────────────────────────────────────────────────────
// Matches the composite rank_score CTE from design.md.

// Rollover de assignments pendientes — antes de generar nuevas, mueve
// las que el spammer dejó incompletas (status != 'done') del día
// anterior (o anteriores) al día de hoy. La idea: el spammer debe
// terminar lo asignado antes de recibir más, pero el quota de 50/día
// es el techo, no el piso — si arrastra 30 pendientes, hoy genera 20
// nuevas para completar 50.
//
// Implementación: UPDATE assigned_date = CURRENT_DATE para todas las
// filas del spammer con assigned_date < CURRENT_DATE y status != 'done'.
// El UNIQUE constraint (spammer_id, lead_id, assigned_date) podría
// chocar si HOY ya existe una assignment para ese mismo lead — en ese
// caso descartamos la antigua (ya está siendo procesada hoy).
async function rolloverPending(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tenantId: string,
  spammerId: string,
): Promise<number> {
  // Primero, leemos las assignments incompletas históricas. Limit alto
  // porque si hay backlog grande, queremos rollearlo todo.
  const { data: pending, error: pErr } = await supabase
    .from("scouter_daily_assignments")
    .select("id, lead_id, assigned_date")
    .eq("tenant_id", tenantId)
    .eq("spammer_id", spammerId)
    .lt("assigned_date", new Date().toISOString().slice(0, 10))
    .neq("status", "done")
    .limit(500);
  if (pErr) {
    console.error("rolloverPending list error", pErr);
    return 0;
  }
  if (!pending || pending.length === 0) return 0;

  // Si ya existe una row HOY para ese mismo lead (porque el cron corrió
  // antes manualmente, o cualquier otra razón), descartamos la vieja
  // para evitar el conflict del UNIQUE — la del día actual gana.
  const today = new Date().toISOString().slice(0, 10);
  const leadIds = pending.map((p: { lead_id: string }) => p.lead_id);
  const { data: dupes } = await supabase
    .from("scouter_daily_assignments")
    .select("lead_id")
    .eq("tenant_id", tenantId)
    .eq("spammer_id", spammerId)
    .eq("assigned_date", today)
    .in("lead_id", leadIds);
  const dupeLeadIds = new Set((dupes ?? []).map((d: { lead_id: string }) => d.lead_id));

  const rollableIds = (pending as Array<{ id: string; lead_id: string }>)
    .filter((p) => !dupeLeadIds.has(p.lead_id))
    .map((p) => p.id);

  if (rollableIds.length === 0) return 0;

  // Bulk UPDATE — solo movemos las que NO chocan.
  const { error: uErr } = await supabase
    .from("scouter_daily_assignments")
    .update({ assigned_date: today })
    .in("id", rollableIds);
  if (uErr) {
    console.error("rolloverPending update error", uErr);
    return 0;
  }
  return rollableIds.length;
}

async function rankLeads(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tenantId: string,
  spammerId: string,
  cooldownDays: number,
  batchSize: number,
): Promise<RankedLead[]> {
  // Supabase JS client doesn't support CTEs directly, so we use rpc or
  // raw SQL via the postgres extension. We use a stored procedure pattern
  // compatible with the project: call .rpc if available, else fallback
  // to a simpler approximation via chained queries.
  //
  // Since the project uses supabase-js v2 with service role, we can use
  // the REST SQL endpoint via fetch, but the cleanest Deno-edge approach
  // is to rely on supabase.rpc() with a helper function, or to build an
  // equivalent multi-step query.
  //
  // We implement the ranking inline using a raw SQL call via the
  // Postgres REST API (PostgREST /rpc or direct SQL via pg extension).
  // The service role key gives us access to run the query.
  //
  // We use supabase.rpc('scouter_rank_leads', {...}) but since that
  // function may not exist yet, we fall back to a simplified JS-side
  // scoring using available columns.
  //
  // PRIMARY approach: use Supabase's built-in .rpc() pointing to a
  // Postgres function named scouter_rank_leads_for_tenant if it exists.
  // FALLBACK: construct the ranking in JS after fetching leads + history counts.

  // Try the full SQL path via PostgREST's /sql endpoint (available in Supabase with service role).
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const sql = `
    WITH lead_scores AS (
      SELECT
        l.id,
        l.instagram_handle,
        l.ai_score,
        l.followers,
        l.bio,
        l.country,
        l.target_companies,
        l.status,
        COALESCE(
          CURRENT_DATE - MAX(da.assigned_date)::date,
          999
        ) AS days_since_assigned,
        COUNT(DISTINCT ih.id) AS interaction_count,
        (
          COALESCE(l.ai_score, 0) * 10
          + LEAST(COALESCE(CURRENT_DATE - MAX(da.assigned_date)::date, 30), 30)
          - COUNT(DISTINCT ih.id) * 2
          + CASE
              WHEN l.status = 'candidate'  THEN 15
              WHEN l.status = 'discovery'  THEN 10
              WHEN l.status = 'contacting' THEN 5
              ELSE 0
            END
        ) AS rank_score
      FROM scouter_leads l
      LEFT JOIN scouter_daily_assignments da ON da.lead_id = l.id
      LEFT JOIN scouter_interaction_history ih ON ih.lead_id = l.id
      WHERE l.tenant_id = '${tenantId}'
        AND l.ai_status IN ('high_fit', 'medium_fit', 'approved')
        AND l.status NOT IN ('active', 'rejected', 'discarded')
      GROUP BY l.id
      HAVING COALESCE(CURRENT_DATE - MAX(da.assigned_date)::date, 999) >= ${cooldownDays}
    )
    SELECT * FROM lead_scores
    ORDER BY rank_score DESC
    LIMIT ${batchSize};
  `;

  // Use PostgREST SQL endpoint (requires pg_net or direct SQL access).
  // Supabase Edge Functions can call the DB via the REST /sql endpoint
  // with the service role key.
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/scouter_rank_leads_for_spammer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_spammer_id: spammerId,
      p_cooldown_days: cooldownDays,
      p_batch_size: batchSize,
    }),
  });

  // If the RPC function exists and returns data, use it.
  if (res.ok) {
    const data = await res.json();
    if (Array.isArray(data)) {
      return data as RankedLead[];
    }
  }

  // Fallback: fetch leads and compute rank in JS.
  console.log("RPC scouter_rank_leads_for_spammer no disponible, usando fallback JS ranking.");
  return await rankLeadsFallback(supabase, tenantId, spammerId, cooldownDays, batchSize);
}

async function rankLeadsFallback(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tenantId: string,
  _spammerId: string,
  cooldownDays: number,
  batchSize: number,
): Promise<RankedLead[]> {
  // Fetch eligible leads
  const { data: leads, error: leadsErr } = await supabase
    .from("scouter_leads")
    .select("id, instagram_handle, ai_score, followers, bio, country, status, contact_touches")
    .eq("tenant_id", tenantId)
    .in("ai_status", ["high_fit", "medium_fit", "approved"])
    .not("status", "in", '("active","rejected","discarded")')
    .limit(500); // fetch more than batchSize to allow filtering

  if (leadsErr) throw leadsErr;
  if (!leads || leads.length === 0) return [];

  const leadIds = leads.map((l: { id: string }) => l.id);

  // Fetch most recent assignment per lead — pull tenant-scope (NO
  // spammer filter) so we exclude leads asignados a CUALQUIER spammer
  // del tenant en los últimos cooldownDays. Esa es la dedupción
  // cross-spammer que la RPC oficial ya hace.
  const { data: assignments } = await supabase
    .from("scouter_daily_assignments")
    .select("lead_id, assigned_date")
    .eq("tenant_id", tenantId)
    .in("lead_id", leadIds)
    .order("assigned_date", { ascending: false });

  // Build last assigned date map
  const lastAssigned: Record<string, string> = {};
  for (const a of assignments ?? []) {
    if (!lastAssigned[a.lead_id]) {
      lastAssigned[a.lead_id] = a.assigned_date;
    }
  }

  // Fetch interaction counts per lead
  const { data: interactions } = await supabase
    .from("scouter_interaction_history")
    .select("lead_id")
    .in("lead_id", leadIds);

  const interactionCount: Record<string, number> = {};
  for (const i of interactions ?? []) {
    interactionCount[i.lead_id] = (interactionCount[i.lead_id] ?? 0) + 1;
  }

  const today = new Date();
  const todayMs = today.getTime();

  const ranked: RankedLead[] = [];
  for (const l of leads) {
    const lastDate = lastAssigned[l.id];
    let daysSince = 999;
    if (lastDate) {
      const diffMs = todayMs - new Date(lastDate).getTime();
      daysSince = Math.floor(diffMs / 86_400_000);
    }
    if (daysSince < cooldownDays) continue;

    const cnt = interactionCount[l.id] ?? 0;
    const stageBonus =
      l.status === "candidate" ? 15
      : l.status === "discovery" ? 10
      : l.status === "contacting" ? 5
      : 0;

    const rankScore =
      (l.ai_score ?? 0) * 10 + Math.min(daysSince, 30) - cnt * 2 + stageBonus;

    ranked.push({
      id: l.id,
      instagram_handle: l.instagram_handle,
      ai_score: l.ai_score,
      followers: l.followers,
      bio: l.bio,
      country: l.country,
      status: l.status,
      interaction_count: cnt,
      days_since_assigned: daysSince,
      rank_score: rankScore,
    });
  }

  ranked.sort((a, b) => b.rank_score - a.rank_score);
  return ranked.slice(0, batchSize);
}

// ─── Groq call ────────────────────────────────────────────────────────────────

async function callGroqBatch(
  groqKey: string,
  systemPrompt: string,
  userMessage: string,
): Promise<GroqLeadResult[]> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            userMessage +
            '\n\nResponde SOLO con un JSON object con una key "leads" que contiene el array de resultados.',
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Groq error", res.status, errText.slice(0, 500));
    if (res.status === 429) throw new Error("Groq: rate limit. Esperá unos segundos.");
    if (res.status === 401 || res.status === 402) {
      throw new Error("Groq: cuota agotada o key inválida.");
    }
    throw new Error(`Groq error ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("Groq devolvió JSON inválido:", raw.slice(0, 500));
    return [];
  }

  // Groq with json_object mode returns { leads: [...] } or just [...]
  if (Array.isArray(parsed)) return parsed as GroqLeadResult[];
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.leads)) return obj.leads as GroqLeadResult[];

  console.warn("Groq respuesta inesperada:", JSON.stringify(parsed).slice(0, 500));
  return [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
