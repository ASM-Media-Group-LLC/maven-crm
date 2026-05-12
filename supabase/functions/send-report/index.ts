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
    "authorization, x-client-info, apikey, content-type",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: solo invocaciones internas (dispatch-reports o frontend admin
  // con el secret). Mismo X-Cron-Token que dispatch-reports valida.
  const cronToken = req.headers.get("X-Cron-Token");
  const expected = Deno.env.get("CRON_INTERNAL_TOKEN");
  if (!expected || cronToken !== expected) {
    console.warn("[send-report] invalid or missing X-Cron-Token");
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { schedule_id, from, to } = (await req.json()) as {
      schedule_id?: string;
      from?: string;
      to?: string;
    };
    if (!schedule_id || !from || !to) {
      return new Response(
        JSON.stringify({ error: "schedule_id, from y to son requeridos" }),
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
    const emails = (recipients ?? []).map((r: any) => r.email);
    if (emails.length === 0) {
      console.warn("[send-report] schedule sin destinatarios", schedule_id);
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no_recipients" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const module = schedule.module as Module;
    const period = schedule.period as Period;

    // 2. Métricas por módulo
    const rows = await fetchModuleMetrics(admin, module, from, to);

    // 3. HTML
    const html = renderReportHtml({ name: schedule.name, module, period, from, to, rows });

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
    const subject = `Maven CRM · Reporte ${PERIOD_LABEL[period]} ${MODULE_LABEL[module]}`;

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

interface MetricRow {
  name: string;
  cells: Array<{ label: string; value: string }>;
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
    .select("lg_user_id, phone_e164, phone_raw")
    .gte("entry_date", fromDate)
    .lte("entry_date", toDate);
  if (error) throw error;

  const byUser: Record<string, { leads: number; phones: number }> = {};
  for (const l of (leads ?? []) as Array<{ lg_user_id: string | null; phone_e164: string | null; phone_raw: string | null }>) {
    if (!l.lg_user_id) continue;
    if (!byUser[l.lg_user_id]) byUser[l.lg_user_id] = { leads: 0, phones: 0 };
    byUser[l.lg_user_id].leads++;
    if (l.phone_e164 || l.phone_raw) byUser[l.lg_user_id].phones++;
  }

  const ids = Object.keys(byUser);
  const nameMap = await resolveNames(admin, ids);
  return Object.entries(byUser)
    .sort((a, b) => b[1].leads - a[1].leads)
    .map(([id, m]) => ({
      name: nameMap[id] ?? "Sin nombre",
      cells: [
        { label: "Leads ingresados", value: String(m.leads) },
        { label: "Números obtenidos", value: String(m.phones) },
        { label: "Conversión", value: m.leads > 0 ? `${Math.round((m.phones / m.leads) * 100)}%` : "—" },
      ],
    }));
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

  const byUser: Record<string, { asignadas: number; confirmadas: number; completadas: number; no_cerradas: number }> = {};
  for (const c of (creators ?? []) as Array<{
    assigned_to: string | null;
    stage: string | null;
    passed_date: string | null;
    confirmed_date: string | null;
    completed_date: string | null;
    updated_at: string | null;
  }>) {
    if (!c.assigned_to) continue;
    if (!byUser[c.assigned_to]) byUser[c.assigned_to] = { asignadas: 0, confirmadas: 0, completadas: 0, no_cerradas: 0 };
    if (c.passed_date && c.passed_date >= fromDate && c.passed_date <= toDate) byUser[c.assigned_to].asignadas++;
    if (c.confirmed_date && c.confirmed_date >= from && c.confirmed_date <= to) byUser[c.assigned_to].confirmadas++;
    if (c.completed_date && c.completed_date >= from && c.completed_date <= to) byUser[c.assigned_to].completadas++;
    if (c.stage === "No interesada" && c.updated_at && c.updated_at >= from && c.updated_at <= to)
      byUser[c.assigned_to].no_cerradas++;
  }

  // Llamadas + avg QA score por closer_id en el rango.
  const { data: calls } = await admin
    .from("qa_calls")
    .select("closer_id, claude_score, created_at")
    .gte("created_at", from)
    .lte("created_at", to);
  const callsByUser: Record<string, { count: number; scoreSum: number; scored: number }> = {};
  for (const k of (calls ?? []) as Array<{ closer_id: string | null; claude_score: number | null }>) {
    if (!k.closer_id) continue;
    if (!callsByUser[k.closer_id]) callsByUser[k.closer_id] = { count: 0, scoreSum: 0, scored: 0 };
    callsByUser[k.closer_id].count++;
    if (k.claude_score != null) {
      callsByUser[k.closer_id].scoreSum += Number(k.claude_score);
      callsByUser[k.closer_id].scored++;
    }
  }

  const allIds = Array.from(new Set([...Object.keys(byUser), ...Object.keys(callsByUser)]));
  const nameMap = await resolveNames(admin, allIds);

  return allIds
    .map((id) => {
      const m = byUser[id] ?? { asignadas: 0, confirmadas: 0, completadas: 0, no_cerradas: 0 };
      const c = callsByUser[id] ?? { count: 0, scoreSum: 0, scored: 0 };
      const avgQa = c.scored > 0 ? Math.round(c.scoreSum / c.scored) : null;
      const cerradas = m.confirmadas + m.completadas;
      return {
        name: nameMap[id] ?? "Sin nombre",
        sortKey: cerradas,
        cells: [
          { label: "Asignadas", value: String(m.asignadas) },
          { label: "Confirmadas", value: String(m.confirmadas) },
          { label: "Completadas", value: String(m.completadas) },
          { label: "Cerradas", value: String(cerradas) },
          { label: "No cerradas", value: String(m.no_cerradas) },
          { label: "Llamadas", value: String(c.count) },
          { label: "Calif QA prom", value: avgQa != null ? `${avgQa}/100` : "—" },
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
        { label: "Evaluadas", value: String(m.total) },
        { label: "Aprobadas", value: String(m.aprobadas) },
        { label: "Reprobadas", value: String(m.reprobadas) },
        { label: "% éxito", value: m.total > 0 ? `${Math.round((m.aprobadas / m.total) * 100)}%` : "—" },
        { label: "Score prom", value: m.scored > 0 ? `${Math.round(m.scoreSum / m.scored)}` : "—" },
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
}): string {
  const { name, module, period, from, to, rows } = args;
  const fromLabel = fmtMiami(from);
  const toLabel = fmtMiami(to);
  const colHeaders =
    module === "llg"
      ? ["Persona", "Leads", "Núm. obtenidos", "Conv."]
      : module === "closers"
        ? ["Persona", "Asignadas", "Confirmadas", "Completadas", "Cerradas", "No cerradas", "Llamadas", "QA prom"]
        : ["Persona", "Evaluadas", "Aprobadas", "Reprobadas", "% éxito", "Score prom"];

  const tableRows = rows
    .map(
      (r) =>
        `<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 12px;font-weight:600;">${escapeHtml(r.name)}</td>${r.cells
          .map(
            (c) =>
              `<td style="padding:8px 12px;text-align:right;font-variant-numeric:tabular-nums;color:#111827;">${escapeHtml(c.value)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  const emptyState = rows.length === 0
    ? `<tr><td colspan="${colHeaders.length}" style="padding:24px;text-align:center;color:#6b7280;font-style:italic;">Sin actividad registrada en el rango.</td></tr>`
    : "";

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:720px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
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
