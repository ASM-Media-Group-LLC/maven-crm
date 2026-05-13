// send-report — corre el SQL del módulo (llg / closers / chatters) para
// un rango de fechas, arma HTML Maven-branded y manda el email via
// Resend a cada recipient del schedule.
//
// Invocado por dispatch-reports (cron diario 8am Miami) o manualmente
// desde el frontend (botón "enviar de prueba" — futuro).
//
// Body esperado: { schedule_id: string, from: string (ISO), to: string (ISO) }
// from/to son los timestamps de inicio/fin del rango en UTC. El email
// incluye la conversión a Miami time en el header para que el lector
// vea las fechas en su timezone operativo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-token",
};

type Module = "llg" | "closers" | "chatters";
type Period = "daily" | "weekly" | "monthly" | "annual";

const PERIOD_LABEL: Record<Period, string> = {
  daily: "diario",
  weekly: "semanal",
  monthly: "mensual",
  annual: "anual",
};

const MODULE_LABEL: Record<Module, string> = {
  llg: "LLGs",
  closers: "Closers",
  chatters: "Chatters",
};

const fmtMiami = (iso: string) => {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/New_York",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
};

// ─── Range helpers (Miami TZ) ───────────────────────────────────────────
const MIAMI_TZ = "America/New_York";
function miamiParts(d: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: MIAMI_TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) if (p.type !== "literal") parts[p.type] = p.value;
  return { year: parseInt(parts.year), month: parseInt(parts.month), day: parseInt(parts.day), weekday: parts.weekday };
}
function miamiOffsetMin(d: Date): number {
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const miami = new Date(d.toLocaleString("en-US", { timeZone: MIAMI_TZ }));
  return (miami.getTime() - utc.getTime()) / 60_000;
}
function miamiToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number): Date {
  const naive = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return new Date(naive.getTime() - miamiOffsetMin(naive) * 60_000);
}
function computeRangeForPeriod(period: Period, now: Date): { from: string; to: string } {
  const m = miamiParts(now);
  if (period === "daily") {
    const yest = new Date(Date.UTC(m.year, m.month - 1, m.day));
    yest.setUTCDate(yest.getUTCDate() - 1);
    return {
      from: miamiToUtc(yest.getUTCFullYear(), yest.getUTCMonth() + 1, yest.getUTCDate(), 0, 0, 0).toISOString(),
      to: miamiToUtc(yest.getUTCFullYear(), yest.getUTCMonth() + 1, yest.getUTCDate(), 23, 59, 59).toISOString(),
    };
  }
  if (period === "weekly") {
    const today = new Date(Date.UTC(m.year, m.month - 1, m.day));
    const lastMon = new Date(today.getTime() - 7 * 86_400_000);
    const lastSun = new Date(today.getTime() - 1 * 86_400_000);
    return {
      from: miamiToUtc(lastMon.getUTCFullYear(), lastMon.getUTCMonth() + 1, lastMon.getUTCDate(), 0, 0, 0).toISOString(),
      to: miamiToUtc(lastSun.getUTCFullYear(), lastSun.getUTCMonth() + 1, lastSun.getUTCDate(), 23, 59, 59).toISOString(),
    };
  }
  if (period === "monthly") {
    const prevMo = m.month === 1 ? 12 : m.month - 1;
    const prevY = m.month === 1 ? m.year - 1 : m.year;
    const lastDay = new Date(Date.UTC(prevY, prevMo, 0)).getUTCDate();
    return {
      from: miamiToUtc(prevY, prevMo, 1, 0, 0, 0).toISOString(),
      to: miamiToUtc(prevY, prevMo, lastDay, 23, 59, 59).toISOString(),
    };
  }
  const prevY = m.year - 1;
  return {
    from: miamiToUtc(prevY, 1, 1, 0, 0, 0).toISOString(),
    to: miamiToUtc(prevY, 12, 31, 23, 59, 59).toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: aceptamos DOS modos:
  //  · X-Cron-Token (interno desde dispatch-reports y pg_cron)
  //  · JWT válido en Authorization (frontend admin "Enviar ahora")
  // Cualquiera de los dos basta. El JWT lo valida supabase-js al crear
  // el client con el header del request.
  const cronToken = req.headers.get("X-Cron-Token");
  const expected = Deno.env.get("CRON_INTERNAL_TOKEN");
  const authHeader = req.headers.get("Authorization") ?? "";
  const hasCronToken = !!expected && cronToken === expected;
  const hasJwt = authHeader.toLowerCase().startsWith("bearer ") && authHeader.length > 20;
  if (!hasCronToken && !hasJwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { schedule_id, from: fromArg, to: toArg, preview_only } = (await req.json()) as {
      schedule_id?: string;
      from?: string;
      to?: string;
      preview_only?: boolean;
    };
    if (!schedule_id) {
      return new Response(
        JSON.stringify({ error: "schedule_id es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 1. Cargar schedule + recipients
    const { data: schedule, error: sErr } = await admin
      .from("report_schedules")
      .select("*")
      .eq("id", schedule_id)
      .single();
    if (sErr || !schedule) {
      console.error("[send-report] schedule not found", schedule_id, sErr?.message);
      return new Response(JSON.stringify({ error: "Schedule no encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: recipients } = await admin
      .from("report_recipients")
      .select("email")
      .eq("schedule_id", schedule_id);
    const rawEmails = (recipients ?? []).map((r: any) => r.email as string);

    // Filtro de validación — mismo criterio que el frontend para evitar
    // que Resend devuelva 422 si una dirección tiene formato roto.
    const isValidEmail = (raw: string): boolean => {
      const v = (raw ?? "").trim().toLowerCase();
      if (!v || v.length > 254) return false;
      const at = v.indexOf("@");
      if (at < 1 || at !== v.lastIndexOf("@")) return false;
      const local = v.slice(0, at);
      const domain = v.slice(at + 1);
      if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
      if (!/^[a-zA-Z0-9._%+-]+$/.test(local)) return false;
      if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
      if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) return false;
      return true;
    };
    const emails = rawEmails.filter(isValidEmail);
    const invalid = rawEmails.filter((e) => !isValidEmail(e));
    if (invalid.length > 0) {
      console.warn("[send-report] skipping invalid emails:", invalid);
    }
    if (emails.length === 0) {
      console.warn("[send-report] no valid recipients", schedule_id, "invalid:", invalid);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Sin destinatarios válidos",
          invalid_emails: invalid,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const module = schedule.module as Module;
    const period = schedule.period as Period;

    // Si dispatch-reports pasó from/to, los usamos. Si vino del botón
    // "Enviar ahora" sin rango, computamos el rango del period en Miami.
    let from = fromArg;
    let to = toArg;
    if (!from || !to) {
      const r = computeRangeForPeriod(period, new Date());
      from = r.from;
      to = r.to;
    }

    // 2. Métricas por módulo
    const rows = await fetchModuleMetrics(admin, module, from, to);

    // 3. HTML
    const html = renderReportHtml({
      name: schedule.name,
      module,
      period,
      from,
      to,
      rows,
      metrics: (schedule.metrics as string[] | null) ?? null,
    });

    // Preview mode: devuelve HTML + subject sin mandar email ni tocar
    // last_dispatched_at. Usado por el toggle "Vista previa" en UI admin.
    if (preview_only) {
      const customSubject = (schedule.email_subject ?? "").trim();
      const subject = customSubject || `Maven CRM · Reporte ${PERIOD_LABEL[period]} ${MODULE_LABEL[module]}`;
      return new Response(
        JSON.stringify({ ok: true, preview: true, html, subject, from, to, row_count: rows.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("[send-report] RESEND_API_KEY no configurada");
      return new Response(JSON.stringify({ error: "RESEND_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rawFrom = Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@mail.maven-ai.me";
    const fromEmail = rawFrom.includes("<") ? rawFrom : `Maven CRM <${rawFrom}>`;
    const customSubject = (schedule.email_subject ?? "").trim();
    const subject = customSubject || `Maven CRM · Reporte ${PERIOD_LABEL[period]} ${MODULE_LABEL[module]}`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: emails, subject, html }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[send-report] Resend ${resp.status}: ${body.slice(0, 300)}`);
      return new Response(JSON.stringify({ error: "Resend failed", detail: body }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Marca last_dispatched_at
    await admin
      .from("report_schedules")
      .update({ last_dispatched_at: new Date().toISOString() })
      .eq("id", schedule_id);

    return new Response(JSON.stringify({ ok: true, sent: emails.length, rows: rows.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-report] exception:", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Métricas por módulo ────────────────────────────────────────────────

// Catálogo de métricas (key → { label, module }). Espejo del catálogo
// del frontend en hooks/reportMetricsCatalog.ts. Si agregás una nueva
// métrica, ACTUALIZÁ LOS DOS.
const METRIC_CATALOG: Record<string, { label: string; module: Module }> = {
  "llg.nuevos":          { label: "Leads Nuevos",         module: "llg" },
  "llg.recuperacion":    { label: "Leads Recuperación",   module: "llg" },
  "llg.numeros":         { label: "Núm. obtenidos",       module: "llg" },
  "llg.conversion":      { label: "Conv.",                module: "llg" },
  "closer.asignadas":    { label: "Asignadas",            module: "closers" },
  "closer.confirmadas":  { label: "Confirmadas",          module: "closers" },
  "closer.completadas":  { label: "Completadas",          module: "closers" },
  "closer.llamadas":     { label: "Llamadas",             module: "closers" },
  "closer.qa_avg":       { label: "Nota QA",              module: "closers" },
  "closer.cerradas":     { label: "Cerradas",             module: "closers" },
  "closer.no_cerradas":  { label: "No cerradas",          module: "closers" },
  "chatter.evaluadas":   { label: "Evaluadas",            module: "chatters" },
  "chatter.aprobadas":   { label: "Aprobadas",            module: "chatters" },
  "chatter.reprobadas":  { label: "Reprobadas",           module: "chatters" },
  "chatter.exito":       { label: "% éxito",              module: "chatters" },
  "chatter.score_avg":   { label: "Score prom",           module: "chatters" },
};

const DEFAULT_METRICS_BY_MODULE: Record<Module, string[]> = {
  llg: ["llg.nuevos", "llg.recuperacion", "llg.numeros", "llg.conversion"],
  closers: [
    "closer.asignadas",
    "closer.confirmadas",
    "closer.completadas",
    "closer.llamadas",
    "closer.qa_avg",
    "closer.cerradas",
    "closer.no_cerradas",
  ],
  chatters: [
    "chatter.evaluadas",
    "chatter.aprobadas",
    "chatter.reprobadas",
    "chatter.exito",
    "chatter.score_avg",
  ],
};

interface MetricRow {
  name: string;
  // Cada celda lleva su metric key para poder filtrar al renderizar.
  cells: Array<{ key: string; value: string }>;
}

async function fetchModuleMetrics(
  admin: ReturnType<typeof createClient>,
  module: Module,
  from: string,
  to: string,
): Promise<MetricRow[]> {
  if (module === "llg") return fetchLlgMetrics(admin, from, to);
  if (module === "closers") return fetchCloserMetrics(admin, from, to);
  return fetchChatterMetrics(admin, from, to);
}

async function fetchLlgMetrics(
  admin: ReturnType<typeof createClient>,
  from: string,
  to: string,
): Promise<MetricRow[]> {
  // entry_date es DATE — comparamos contra YYYY-MM-DD de from/to.
  const fromDate = from.slice(0, 10);
  const toDate = to.slice(0, 10);
  const { data: leads, error } = await admin
    .from("leadgen_entries")
    .select("lg_user_id, phone_e164, phone_raw, record_type")
    .gte("entry_date", fromDate)
    .lte("entry_date", toDate);
  if (error) throw error;

  // Split: NUEVOS (record_type 'nuevo' o NULL legacy) vs RECUPERACIÓN
  // (record_type 'reactivado' — duplicados re-ingresados post lock 24h).
  const byUser: Record<string, { nuevos: number; recuperacion: number; phones: number }> = {};
  for (const l of (leads ?? []) as Array<{
    lg_user_id: string | null;
    phone_e164: string | null;
    phone_raw: string | null;
    record_type: string | null;
  }>) {
    if (!l.lg_user_id) continue;
    if (!byUser[l.lg_user_id]) byUser[l.lg_user_id] = { nuevos: 0, recuperacion: 0, phones: 0 };
    if (l.record_type === "reactivado") byUser[l.lg_user_id].recuperacion++;
    else byUser[l.lg_user_id].nuevos++;
    if (l.phone_e164 || l.phone_raw) byUser[l.lg_user_id].phones++;
  }

  const ids = Object.keys(byUser);
  const nameMap = await resolveNames(admin, ids);
  return Object.entries(byUser)
    .sort((a, b) => (b[1].nuevos + b[1].recuperacion) - (a[1].nuevos + a[1].recuperacion))
    .map(([id, m]) => {
      const total = m.nuevos + m.recuperacion;
      return {
        name: nameMap[id] ?? "Sin nombre",
        cells: [
          { key: "llg.nuevos", value: String(m.nuevos) },
          { key: "llg.recuperacion", value: String(m.recuperacion) },
          { key: "llg.numeros", value: String(m.phones) },
          { key: "llg.conversion", value: total > 0 ? `${Math.round((m.phones / total) * 100)}%` : "—" },
        ],
      };
    });
}

async function fetchCloserMetrics(
  admin: ReturnType<typeof createClient>,
  from: string,
  to: string,
): Promise<MetricRow[]> {
  const fromDate = from.slice(0, 10);
  const toDate = to.slice(0, 10);

  // closer_creators por assigned_to — métricas por etapa en el rango.
  const { data: creators, error } = await admin
    .from("closer_creators")
    .select("assigned_to, stage, passed_date, confirmed_date, completed_date, updated_at");
  if (error) throw error;

  // Stage counts: asignadas / confirmadas / completadas en el rango.
  // No usamos stage='No interesada' acá para "no cerradas" — esa métrica
  // ahora viene del outcome de qa_calls (en_espera + no_cerro = mismo
  // resultado matemático). "Cerradas" también viene del QA (outcome='cerro').
  const byUser: Record<string, { asignadas: number; confirmadas: number; completadas: number }> = {};
  for (const c of (creators ?? []) as Array<{
    assigned_to: string | null;
    stage: string | null;
    passed_date: string | null;
    confirmed_date: string | null;
    completed_date: string | null;
    updated_at: string | null;
  }>) {
    if (!c.assigned_to) continue;
    if (!byUser[c.assigned_to]) byUser[c.assigned_to] = { asignadas: 0, confirmadas: 0, completadas: 0 };
    if (c.passed_date && c.passed_date >= fromDate && c.passed_date <= toDate) byUser[c.assigned_to].asignadas++;
    if (c.confirmed_date && c.confirmed_date >= from && c.confirmed_date <= to) byUser[c.assigned_to].confirmadas++;
    if (c.completed_date && c.completed_date >= from && c.completed_date <= to) byUser[c.assigned_to].completadas++;
  }

  // qa_calls.closer_id usa qa_closers.id (NO profiles.id). Mapeamos
  // qa_closer_id → profile_id via qa_closers.profile_id para unificar
  // el espacio de IDs con closer_creators.assigned_to. Sin esto, un
  // mismo closer (Miguel García) aparecía 2 veces en el reporte: una
  // desde closer_creators (resuelto vía profiles) y otra desde qa_calls
  // como "Sin nombre" (sin match en profiles).
  const { data: qaClosers } = await admin
    .from("qa_closers")
    .select("id, profile_id, name");
  const qaCloserToProfile: Record<string, { profile_id: string | null; name: string | null }> = {};
  for (const qc of (qaClosers ?? []) as Array<{ id: string; profile_id: string | null; name: string | null }>) {
    qaCloserToProfile[qc.id] = { profile_id: qc.profile_id, name: qc.name };
  }

  const { data: calls } = await admin
    .from("qa_calls")
    .select("closer_id, claude_score, call_date, claude_analysis");
  const callsByUser: Record<string, {
    count: number;
    scoreSum: number;
    scored: number;
    cerradas: number;
    noCerradas: number;
    fallbackName: string | null;
  }> = {};
  for (const k of (calls ?? []) as Array<{
    closer_id: string | null;
    claude_score: number | null;
    call_date: string | null;
    claude_analysis: Record<string, unknown> | null;
  }>) {
    if (!k.closer_id) continue;
    if (!k.call_date || k.call_date < from || k.call_date > to) continue;
    // Resolver al profile_id (espacio unificado con closer_creators).
    // Si qa_closer no tiene profile_id (legado), agrupamos por qa_closer_id
    // y guardamos el name de qa_closers como fallback.
    const mapping = qaCloserToProfile[k.closer_id];
    const userKey = mapping?.profile_id ?? k.closer_id;
    if (!callsByUser[userKey]) {
      callsByUser[userKey] = {
        count: 0, scoreSum: 0, scored: 0, cerradas: 0, noCerradas: 0,
        fallbackName: mapping?.name ?? null,
      };
    }
    callsByUser[userKey].count++;
    if (k.claude_score != null) {
      callsByUser[userKey].scoreSum += Number(k.claude_score);
      callsByUser[userKey].scored++;
    }
    const outcome = (k.claude_analysis as any)?.call_outcome as string | undefined;
    if (outcome === "cerro") callsByUser[userKey].cerradas++;
    else if (outcome === "en_espera" || outcome === "no_cerro") callsByUser[userKey].noCerradas++;
  }

  const allIds = Array.from(new Set([...Object.keys(byUser), ...Object.keys(callsByUser)]));
  const nameMap = await resolveNames(admin, allIds);

  return allIds
    .map((id) => {
      const m = byUser[id] ?? { asignadas: 0, confirmadas: 0, completadas: 0 };
      const c = callsByUser[id] ?? { count: 0, scoreSum: 0, scored: 0, cerradas: 0, noCerradas: 0, fallbackName: null };
      const avgQa = c.scored > 0 ? Math.round(c.scoreSum / c.scored) : null;
      // Orden de resolución del nombre:
      //   1. profiles.full_name (caso normal, vía profile_id resuelto)
      //   2. qa_closers.name (fallback si qa_closer no tiene profile_id)
      //   3. "Sin nombre" (último recurso — closer huérfano)
      const displayName = nameMap[id] ?? c.fallbackName ?? "Sin nombre";
      return {
        name: displayName,
        sortKey: c.cerradas,
        cells: [
          { key: "closer.asignadas", value: String(m.asignadas) },
          { key: "closer.confirmadas", value: String(m.confirmadas) },
          { key: "closer.completadas", value: String(m.completadas) },
          { key: "closer.llamadas", value: String(c.count) },
          { key: "closer.qa_avg", value: avgQa != null ? `${avgQa}/100` : "—" },
          { key: "closer.cerradas", value: String(c.cerradas) },
          { key: "closer.no_cerradas", value: String(c.noCerradas) },
        ],
      };
    })
    .sort((a, b) => b.sortKey - a.sortKey)
    .map(({ sortKey: _sortKey, ...rest }) => rest);
}

async function fetchChatterMetrics(
  admin: ReturnType<typeof createClient>,
  from: string,
  to: string,
): Promise<MetricRow[]> {
  // chatter_evaluations.session_id → chatter_sessions.chatter_name.
  const { data: evals } = await admin
    .from("chatter_evaluations")
    .select("session_id, verdict, score_pct, created_at")
    .gte("created_at", from)
    .lte("created_at", to);
  const sessionIds = Array.from(new Set(((evals ?? []) as any[]).map((e) => e.session_id).filter(Boolean)));
  if (sessionIds.length === 0) return [];
  const { data: sessions } = await admin
    .from("chatter_sessions")
    .select("id, chatter_name")
    .in("id", sessionIds);
  const sessionMap: Record<string, string> = {};
  for (const s of (sessions ?? []) as any[]) sessionMap[s.id] = s.chatter_name ?? "Sin nombre";

  const byChatter: Record<string, { total: number; aprobadas: number; reprobadas: number; scoreSum: number; scored: number }> = {};
  for (const e of (evals ?? []) as any[]) {
    const name = sessionMap[e.session_id] ?? "Sin nombre";
    if (!byChatter[name]) byChatter[name] = { total: 0, aprobadas: 0, reprobadas: 0, scoreSum: 0, scored: 0 };
    byChatter[name].total++;
    if (e.verdict === "apto") byChatter[name].aprobadas++;
    else if (e.verdict === "no_apto") byChatter[name].reprobadas++;
    if (e.score_pct != null) {
      byChatter[name].scoreSum += Number(e.score_pct);
      byChatter[name].scored++;
    }
  }

  return Object.entries(byChatter)
    .map(([name, m]) => ({
      name,
      sortKey: m.aprobadas,
      cells: [
        { key: "chatter.evaluadas", value: String(m.total) },
        { key: "chatter.aprobadas", value: String(m.aprobadas) },
        { key: "chatter.reprobadas", value: String(m.reprobadas) },
        { key: "chatter.exito", value: m.total > 0 ? `${Math.round((m.aprobadas / m.total) * 100)}%` : "—" },
        { key: "chatter.score_avg", value: m.scored > 0 ? `${Math.round(m.scoreSum / m.scored)}` : "—" },
      ],
    }))
    .sort((a, b) => b.sortKey - a.sortKey)
    .map(({ sortKey: _sortKey, ...rest }) => rest);
}

async function resolveNames(
  admin: ReturnType<typeof createClient>,
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await admin.from("profiles").select("id, full_name").in("id", ids);
  const map: Record<string, string> = {};
  for (const p of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
    map[p.id] = p.full_name || "Sin nombre";
  }
  return map;
}

// ─── HTML render ────────────────────────────────────────────────────────

function renderReportHtml(args: {
  name: string;
  module: Module;
  period: Period;
  from: string;
  to: string;
  rows: MetricRow[];
  metrics: string[] | null;
}): string {
  const { name, module, period, from, to, rows, metrics } = args;
  const fromLabel = fmtMiami(from);
  const toLabel = fmtMiami(to);
  // Si el schedule define metrics, usamos ese orden. Si no, el default
  // del módulo.
  const metricKeys = metrics && metrics.length > 0 ? metrics : DEFAULT_METRICS_BY_MODULE[module];
  const colHeaders = ["Persona", ...metricKeys.map((k) => METRIC_CATALOG[k]?.label ?? k)];

  const tableRows = rows
    .map((r) => {
      const cellsByKey: Record<string, string> = {};
      for (const c of r.cells) cellsByKey[c.key] = c.value;
      const cellsHtml = metricKeys
        .map(
          (k) =>
            `<td style="padding:8px 12px;text-align:right;font-variant-numeric:tabular-nums;color:#111827;">${escapeHtml(cellsByKey[k] ?? "—")}</td>`,
        )
        .join("");
      return `<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 12px;font-weight:600;">${escapeHtml(r.name)}</td>${cellsHtml}</tr>`;
    })
    .join("");

  const emptyState = rows.length === 0
    ? `<tr><td colspan="${colHeaders.length}" style="padding:24px;text-align:center;color:#6b7280;font-style:italic;">Sin actividad registrada en el rango.</td></tr>`
    : "";

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:720px;margin:0;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:linear-gradient(135deg,#6d28d9,#4338ca);padding:28px 24px;color:#ffffff;">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;opacity:0.85;text-transform:uppercase;">Maven CRM · Reporte ${PERIOD_LABEL[period]}</div>
        <h1 style="font-size:22px;font-weight:700;margin:6px 0 0;line-height:1.3;">${escapeHtml(name)}</h1>
        <p style="font-size:12px;opacity:0.9;margin:8px 0 0;line-height:1.5;">
          Módulo: <strong>${MODULE_LABEL[module]}</strong><br/>
          Rango (hora Miami): <strong>${fromLabel} → ${toLabel}</strong>
        </p>
      </div>
      <div style="padding:20px 18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f9fafb;color:#374151;text-transform:uppercase;font-size:10px;letter-spacing:0.8px;">
              ${colHeaders.map((h, i) => `<th style="padding:10px 12px;text-align:${i === 0 ? "left" : "right"};font-weight:700;">${escapeHtml(h)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${tableRows}${emptyState}
          </tbody>
        </table>
      </div>
      <div style="background:#f9fafb;padding:14px 24px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="color:#9ca3af;font-size:11px;margin:0;">Enviado por Maven CRM · No respondas a este correo.</p>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
