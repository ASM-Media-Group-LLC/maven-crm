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

type Module = "llg" | "closers" | "chatters" | "combined";
type Period = "daily" | "weekly" | "quincenal" | "monthly" | "annual";

// "combined" = un email único con sección LLG + sección Closers.
// Pedido por Alvaro 2026-05-20: en vez de 2 emails separados, recibir
// un solo email con ambas tablas. Internamente, el flow es: levantar
// las dos vistas individualmente (con sus respectivos role filters) y
// renderearlas concatenadas.

const PERIOD_LABEL: Record<Period, string> = {
  daily: "diario",
  weekly: "semanal",
  quincenal: "quincenal",
  monthly: "mensual",
  annual: "anual",
};

const MODULE_LABEL: Record<Module, string> = {
  llg: "LLGs",
  closers: "Closers",
  chatters: "Chatters",
  combined: "Combinado",
};

// Mapeo rol → módulo de reporte. Mirror del catálogo del frontend
// (useReportSchedules.ROLE_TO_MODULE). Si el admin agrega un rol que
// no está mapeado, defaultea a "llg".
const ROLE_TO_MODULE: Record<string, Exclude<Module, "combined">> = {
  closer: "closers",
  "Chatter Supervisor": "chatters",
  LLG: "llg",
  employee: "llg",
  spammer: "llg",
  agent: "llg",
  admin: "llg",
  manager: "llg",
  supervisor: "llg",
};
const roleToModule = (role: string): Exclude<Module, "combined"> =>
  ROLE_TO_MODULE[role] ?? "llg";

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
// Convierte un ISO UTC al YYYY-MM-DD del día Miami que le corresponde.
//
// BUG (pre-2026-05-20): se usaba `iso.slice(0,10)` para sacar la fecha,
// pero el ISO está en UTC. Para "May 19 23:59:59 Miami (EDT=UTC-4)" el
// ISO es "2026-05-20T03:59:59Z" — slice da "2026-05-20", no "2026-05-19".
// Resultado: queries con .lte("entry_date", toDate) incluían el día
// siguiente entero, inflando counts del reporte cuando se enviaba en
// medio del día con datos ya cargados del día actual.
//
// Fix: usar Intl con la TZ Miami para sacar la fecha real del día Miami.
function miamiDate(iso: string): string {
  const d = new Date(iso);
  // en-CA produce el formato YYYY-MM-DD nativo, sin re-armar.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: MIAMI_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(d);
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
  if (period === "quincenal") {
    // Últimos 15 días terminando ayer Miami — mismo cálculo que dispatch-reports.
    const today = new Date(Date.UTC(m.year, m.month - 1, m.day));
    const yest = new Date(today.getTime() - 1 * 86_400_000);
    const start = new Date(today.getTime() - 15 * 86_400_000);
    return {
      from: miamiToUtc(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), 0, 0, 0).toISOString(),
      to: miamiToUtc(yest.getUTCFullYear(), yest.getUTCMonth() + 1, yest.getUTCDate(), 23, 59, 59).toISOString(),
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

    // 2. Métricas + HTML.
    //    "combined" = caso especial: levantamos las 2 vistas (LLG + Closers)
    //    individualmente con sus respectivos role filters, y renderizamos
    //    un email único con 2 secciones. Para módulos normales, el flow
    //    sigue siendo 1 fetch + 1 render.
    const roleName = (schedule.role_name as string | null) ?? null;
    const metricsConfig = (schedule.metrics as string[] | null) ?? null;
    let html: string;
    let rowCount: number;

    if (module === "combined") {
      // Combined-flex: el admin define qué roles van adentro vía la
      // columna `combined_roles` (text[]). Por cada rol, mapeamos a
      // su módulo correspondiente (closer→closers, Chatter
      // Supervisor→chatters, resto→llg) y armamos una sección.
      //
      // Fallback: si por algún motivo el schedule combined no tiene
      // roles seteados (data migrada desde la versión previa, o admin
      // dejó vacío), defaultea a [LLG, closer] para preservar el
      // comportamiento original.
      const combinedRoles: string[] =
        (schedule.combined_roles as string[] | null) ?? ["LLG", "closer"];
      const sections: Array<{ role: string; module: Module; rows: MetricRow[] }> = [];
      for (const role of combinedRoles) {
        const subModule = roleToModule(role);
        const rows = await fetchModuleMetrics(admin, subModule, from, to, role);
        sections.push({ role, module: subModule, rows });
      }
      html = renderCombinedReportHtml({
        name: schedule.name,
        period,
        from,
        to,
        sections,
        metrics: metricsConfig,
      });
      rowCount = sections.reduce((acc, s) => acc + s.rows.length, 0);
    } else {
      const rows = await fetchModuleMetrics(admin, module, from, to, roleName);
      html = renderReportHtml({
        name: schedule.name,
        module,
        period,
        from,
        to,
        rows,
        metrics: metricsConfig,
        roleName,
      });
      rowCount = rows.length;
    }

    // Preview mode: devuelve HTML + subject sin mandar email ni tocar
    // last_dispatched_at. Usado por el toggle "Vista previa" en UI admin.
    if (preview_only) {
      const customSubject = (schedule.email_subject ?? "").trim();
      const subject = customSubject || `Maven CRM · Reporte ${PERIOD_LABEL[period]} ${MODULE_LABEL[module]}`;
      return new Response(
        JSON.stringify({ ok: true, preview: true, html, subject, from, to, row_count: rowCount }),
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

    return new Response(JSON.stringify({ ok: true, sent: emails.length, rows: rowCount }), {
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
  "llg.total":           { label: "Total Leads",          module: "llg" },
  "llg.numeros":         { label: "Núm. obtenidos",       module: "llg" },
  "llg.conversion":      { label: "Conv.",                module: "llg" },
  "closer.asignadas":    { label: "Asignadas",            module: "closers" },
  "closer.confirmadas":  { label: "Confirmadas",          module: "closers" },
  "closer.completadas":  { label: "Completadas",          module: "closers" },
  "closer.no_interesadas": { label: "No interesadas",     module: "closers" },
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
  llg: ["llg.nuevos", "llg.recuperacion", "llg.total", "llg.numeros", "llg.conversion"],
  closers: [
    "closer.asignadas",
    "closer.confirmadas",
    "closer.completadas",
    "closer.no_interesadas",
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
  // Combinado = LLG defaults + Closer defaults. El renderer detecta el
  // prefijo (llg.* vs closer.*) y arma 2 tablas separadas.
  combined: [
    "llg.nuevos",
    "llg.recuperacion",
    "llg.total",
    "llg.numeros",
    "llg.conversion",
    "closer.asignadas",
    "closer.confirmadas",
    "closer.completadas",
    "closer.no_interesadas",
    "closer.llamadas",
    "closer.qa_avg",
    "closer.cerradas",
    "closer.no_cerradas",
  ],
};

interface MetricRow {
  name: string;
  // user_id presente cuando la métrica se agrupa por usuario Maven
  // (LLG/Closers). NULL para chatters (agrupados por chatter_name externo).
  // Se usa internamente para el filtro por role_name y se omite en render.
  user_id?: string | null;
  // Cada celda lleva su metric key para poder filtrar al renderizar.
  cells: Array<{ key: string; value: string }>;
}

async function fetchModuleMetrics(
  admin: ReturnType<typeof createClient>,
  module: Module,
  from: string,
  to: string,
  roleName: string | null,
): Promise<MetricRow[]> {
  let rows: MetricRow[];
  if (module === "llg") rows = await fetchLlgMetrics(admin, from, to);
  else if (module === "closers") rows = await fetchCloserMetrics(admin, from, to);
  else rows = await fetchChatterMetrics(admin, from, to);

  // Filtro por role_name: si el schedule especifica un rol, mostramos
  // TODOS los users con ese rol — incluso si no tuvieron actividad en
  // el período (con métricas en 0). Esto refleja la lista completa de
  // gente del rol, no solo quienes aparecieron en las tablas operativas.
  // No aplica a chatters (no son users del sistema).
  if (roleName && module !== "chatters") {
    const { data: usersWithRole } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", roleName);
    const roleUserIds = new Set(
      ((usersWithRole ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
    );

    // 1. Mantener solo los rows cuyos user_id estén en el rol.
    rows = rows.filter((r) => !r.user_id || roleUserIds.has(r.user_id));

    // 2. Agregar users del rol que no tienen actividad en el rango
    //    (las celdas quedan en 0/"—"). Ordenados al final por nombre.
    const presentIds = new Set(
      rows.map((r) => r.user_id).filter((id): id is string => !!id),
    );
    const missingIds = [...roleUserIds].filter((id) => !presentIds.has(id));
    if (missingIds.length > 0) {
      const nameMap = await resolveNames(admin, missingIds);
      const emptyCells = makeEmptyCells(module);
      const emptyRows = missingIds
        .map((id) => ({
          name: nameMap[id] ?? "Sin nombre",
          user_id: id,
          cells: emptyCells,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
      rows = [...rows, ...emptyRows];
    }
  }

  return rows;
}

// Celdas vacías (todas en 0 / "—") para users que están en el rol pero
// no tienen actividad en el rango. El orden de keys matchea el catálogo.
function makeEmptyCells(module: Module): Array<{ key: string; value: string }> {
  if (module === "llg") {
    return [
      { key: "llg.nuevos", value: "0" },
      { key: "llg.recuperacion", value: "0" },
      { key: "llg.total", value: "0" },
      { key: "llg.numeros", value: "0" },
      { key: "llg.conversion", value: "—" },
    ];
  }
  if (module === "closers") {
    return [
      { key: "closer.asignadas", value: "0" },
      { key: "closer.confirmadas", value: "0" },
      { key: "closer.completadas", value: "0" },
      { key: "closer.no_interesadas", value: "0" },
      { key: "closer.llamadas", value: "0" },
      { key: "closer.qa_avg", value: "—" },
      { key: "closer.cerradas", value: "0" },
      { key: "closer.no_cerradas", value: "0" },
    ];
  }
  return [];
}

async function fetchLlgMetrics(
  admin: ReturnType<typeof createClient>,
  from: string,
  to: string,
): Promise<MetricRow[]> {
  // entry_date es DATE Miami-local — usamos miamiDate() para sacar el
  // YMD correcto del rango (ver helper). Antes usábamos .slice(0,10)
  // sobre el ISO UTC, lo cual incluía el día siguiente cuando el `to`
  // cruzaba medianoche UTC (May 19 23:59 Miami = May 20 03:59 UTC →
  // slice daba "2026-05-20" en vez de "2026-05-19").
  const fromDate = miamiDate(from);
  const toDate = miamiDate(to);

  // Query 1: LEADS creados en el rango (nuevos / recuperacion / total).
  // Atribución por lg_user_id (el LLG que creó el lead).
  const { data: leads, error: leadsErr } = await admin
    .from("leadgen_entries")
    .select("lg_user_id, record_type")
    .gte("entry_date", fromDate)
    .lte("entry_date", toDate);
  if (leadsErr) throw leadsErr;

  // Query 2: TELÉFONOS obtenidos en el rango. La fuente correcta es
  // closers_contacts — cuando un LLG agrega un contacto desde el modal
  // de LeadGen y escribe un número, se guarda acá (NO en
  // leadgen_entries.phone_*, donde queda NULL). Atribución por
  // created_by del contacto (quien clickeó "Guardar").
  //
  // Filtros:
  //   · created_at en rango (cuando se obtuvo el número, no cuando se
  //     creó el lead — un LLG puede tantear semanas y registrar el
  //     número mucho después de crear el lead).
  //   · phone IS NOT NULL (contacto agregado SIN número no cuenta —
  //     coherente con la regla acordada con el user).
  //
  // BUG-FIX 2026-05-19: antes filtrábamos `leadgen_entry_id IS NOT NULL`
  // para "excluir otros flujos", pero la exclusión por flujo ya la hace
  // el role filter (`role_name='LLG'` en fetchModuleMetrics) — si un
  // closer crea un contacto, no aparece en el LLG report por su rol,
  // FK o no. El FK quedaba NULL en casos legítimos (el LLG agregaba
  // un contacto SIN seleccionar lead pre-existente del autocomplete),
  // y esos números se perdían. Sacamos el filtro: Yeison, Gislaine,
  // Paula tenían TODOS sus phones en 0 porque sus contactos no tienen
  // FK (legítimos pero excluidos).
  const { data: contacts, error: contactsErr } = await admin
    .from("closers_contacts")
    .select("created_by, phone")
    .gte("created_at", from)
    .lte("created_at", to)
    .not("phone", "is", null);
  if (contactsErr) throw contactsErr;

  // Split: NUEVOS (record_type 'nuevo' o NULL legacy) vs RECUPERACIÓN
  // (record_type 'reactivado' — duplicados re-ingresados post lock 24h).
  const byUser: Record<string, { nuevos: number; recuperacion: number; phones: number }> = {};
  for (const l of (leads ?? []) as Array<{
    lg_user_id: string | null;
    record_type: string | null;
  }>) {
    if (!l.lg_user_id) continue;
    if (!byUser[l.lg_user_id]) byUser[l.lg_user_id] = { nuevos: 0, recuperacion: 0, phones: 0 };
    if (l.record_type === "reactivado") byUser[l.lg_user_id].recuperacion++;
    else byUser[l.lg_user_id].nuevos++;
  }

  // Contar teléfonos por quien creó el contacto. Si el user creó
  // contactos pero no creó leads en el mismo rango, igual aparece (con
  // 0 nuevos / 0 recuperacion). Es el comportamiento esperado: queremos
  // ver TODOS los LLG que obtuvieron números esta semana.
  for (const c of (contacts ?? []) as Array<{
    created_by: string | null;
    phone: string | null;
  }>) {
    if (!c.created_by || !c.phone) continue;
    if (!byUser[c.created_by]) byUser[c.created_by] = { nuevos: 0, recuperacion: 0, phones: 0 };
    byUser[c.created_by].phones++;
  }

  const ids = Object.keys(byUser);
  const nameMap = await resolveNames(admin, ids);
  return Object.entries(byUser)
    .sort((a, b) => (b[1].nuevos + b[1].recuperacion) - (a[1].nuevos + a[1].recuperacion))
    .map(([id, m]) => {
      const total = m.nuevos + m.recuperacion;
      return {
        name: nameMap[id] ?? "Sin nombre",
        user_id: id,
        cells: [
          { key: "llg.nuevos", value: String(m.nuevos) },
          { key: "llg.recuperacion", value: String(m.recuperacion) },
          { key: "llg.total", value: String(total) },
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
  // Mismo fix que en fetchLlgMetrics: passed_date / call_date son DATE
  // Miami-local. Antes con .slice(0,10) el toDate quedaba en el día
  // siguiente y los reportes "diarios" enviados durante el día actual
  // contaban actividad del día en curso. miamiDate() devuelve el YMD
  // real del día Miami.
  const fromDate = miamiDate(from);
  const toDate = miamiDate(to);

  // SEMÁNTICA 2026-05-20 (v4): period-based — cada métrica cuenta los
  // EVENTOS (transiciones) que sucedieron DENTRO del rango del reporte.
  // El operador (Alvaro) pidió este cambio el 2026-05-20: el reporte
  // diario tiene que mostrar cero si nadie movió leads ayer, y el
  // quincenal/mensual debe sumar los eventos del rango.
  //
  // Mapping métrica → date column → tipo:
  //   · Asignadas    → passed_date          (DATE)
  //   · Confirmadas  → confirmed_date       (TIMESTAMPTZ)
  //   · Completadas  → completed_date       (TIMESTAMPTZ)
  //   · No interesadas → no_interesada_date (TIMESTAMPTZ, agregada
  //     en migration 20260520010000 — antes no existía).
  //
  // Una lead que cruza Asignada → Confirmada en el mismo período suma
  // en ambas columnas (es trabajo distinto en ambos slots). Si pasó la
  // misma lead semanas atrás, no suma en este período. Es el modelo de
  // "actividad del rango", no "estado del pipeline".
  //
  // Rows con assigned_to=null se agrupan bajo UNASSIGNED_KEY y se
  // renderean como fila "Sin asignar" si tienen actividad en el rango.
  const UNASSIGNED_KEY = "__unassigned__";

  // Helper para chequear si un timestamp/date está dentro del rango.
  // - passed_date: DATE → comparar contra fromDate/toDate (string YMD)
  // - confirmed_date / completed_date / no_interesada_date: TIMESTAMPTZ
  //   → comparar contra el rango ISO completo from/to (timestamptz)
  //
  // Postgres ya filtró las filas que tienen AL MENOS UNA columna en
  // rango (vía .or() abajo), pero la misma fila puede tener una columna
  // en rango y otra fuera — el filter JS por columna es necesario para
  // no inflar las cuentas.
  const isDateInRange = (d: string | null): boolean => {
    if (!d) return false;
    return d >= fromDate && d <= toDate;
  };
  const isTsInRange = (ts: string | null): boolean => {
    if (!ts) return false;
    return ts >= from && ts <= to;
  };

  // Postgres pre-filtra: traer SOLO rows con al menos una columna de
  // fecha dentro del rango. Reduce el dataset que viaja al edge.
  // Cada `.or()` clause es un OR; los anidamos para AND interno con
  // gte/lte por columna.
  const { data: creators, error } = await admin
    .from("closer_creators")
    .select("assigned_to, passed_date, confirmed_date, completed_date, no_interesada_date")
    .or([
      `and(passed_date.gte.${fromDate},passed_date.lte.${toDate})`,
      `and(confirmed_date.gte.${from},confirmed_date.lte.${to})`,
      `and(completed_date.gte.${from},completed_date.lte.${to})`,
      `and(no_interesada_date.gte.${from},no_interesada_date.lte.${to})`,
    ].join(","));
  if (error) throw error;

  const byUser: Record<string, { asignadas: number; confirmadas: number; completadas: number; noInteresadas: number }> = {};
  for (const c of (creators ?? []) as Array<{
    assigned_to: string | null;
    passed_date: string | null;
    confirmed_date: string | null;
    completed_date: string | null;
    no_interesada_date: string | null;
  }>) {
    const key = c.assigned_to ?? UNASSIGNED_KEY;
    if (!byUser[key]) byUser[key] = { asignadas: 0, confirmadas: 0, completadas: 0, noInteresadas: 0 };
    if (isDateInRange(c.passed_date)) byUser[key].asignadas++;
    if (isTsInRange(c.confirmed_date)) byUser[key].confirmadas++;
    if (isTsInRange(c.completed_date)) byUser[key].completadas++;
    if (isTsInRange(c.no_interesada_date)) byUser[key].noInteresadas++;
  }

  // qa_calls.closer_id ahora apunta directo a profiles.id (post unify
  // identity migration). Sin indirection por qa_closers.
  //
  // BUG-FIX 2026-05-16: el filtro de rango se hacía en JS con
  //   `k.call_date < from || k.call_date > to`
  // donde `call_date` es DATE (`"2026-05-15"`) y `from`/`to` venían
  // como ISO completo (`"2026-05-15T05:00:00.000Z"`). La comparación
  // lexicográfica `"2026-05-15" < "2026-05-15T05:..."` siempre daba
  // TRUE (prefijo más corto), entonces TODAS las calls quedaban
  // filtradas y el reporte salía con llamadas/qa_avg/cerradas/no_cerradas
  // en cero. Lo movemos a SQL — Postgres compara DATE vs DATE bien sin
  // depender del formato textual.
  const { data: calls } = await admin
    .from("qa_calls")
    .select("closer_id, claude_score, call_date, claude_analysis")
    .gte("call_date", fromDate)
    .lte("call_date", toDate);
  const callsByUser: Record<string, {
    count: number;
    scoreSum: number;
    scored: number;
    cerradas: number;
    noCerradas: number;
  }> = {};
  for (const k of (calls ?? []) as Array<{
    closer_id: string | null;
    claude_score: number | null;
    call_date: string | null;
    claude_analysis: Record<string, unknown> | null;
  }>) {
    if (!k.closer_id) continue;
    if (!callsByUser[k.closer_id]) {
      callsByUser[k.closer_id] = { count: 0, scoreSum: 0, scored: 0, cerradas: 0, noCerradas: 0 };
    }
    callsByUser[k.closer_id].count++;
    if (k.claude_score != null) {
      callsByUser[k.closer_id].scoreSum += Number(k.claude_score);
      callsByUser[k.closer_id].scored++;
    }
    const outcome = (k.claude_analysis as any)?.call_outcome as string | undefined;
    if (outcome === "cerro") callsByUser[k.closer_id].cerradas++;
    else if (outcome === "en_espera" || outcome === "no_cerro") callsByUser[k.closer_id].noCerradas++;
  }

  const allIds = Array.from(new Set([...Object.keys(byUser), ...Object.keys(callsByUser)]));
  // resolveNames consulta profiles — el sentinel UNASSIGNED_KEY no es
  // un UUID válido, lo excluimos del lookup y le ponemos label manual.
  const realIds = allIds.filter((id) => id !== UNASSIGNED_KEY);
  const nameMap = await resolveNames(admin, realIds);

  return allIds
    .map((id) => {
      const m = byUser[id] ?? { asignadas: 0, confirmadas: 0, completadas: 0, noInteresadas: 0 };
      const c = callsByUser[id] ?? { count: 0, scoreSum: 0, scored: 0, cerradas: 0, noCerradas: 0 };
      const avgQa = c.scored > 0 ? Math.round(c.scoreSum / c.scored) : null;
      const isUnassigned = id === UNASSIGNED_KEY;
      return {
        // "Sin asignar" cuando es el bucket de huérfanos. Para que el
        // operador del reporte sepa que hay leads sin closer (data
        // integrity issue que conviene rastrear).
        name: isUnassigned ? "Sin asignar" : (nameMap[id] ?? "Sin nombre"),
        // user_id null para el bucket virtual — algunos consumers de
        // MetricRow pueden filtrar por esta clave; mejor null que un
        // sentinel que parezca UUID.
        user_id: isUnassigned ? null : id,
        // Las filas "Sin asignar" van al final del listado (sortKey
        // negativo). El sort normal es por cerradas DESC.
        sortKey: isUnassigned ? -1 : c.cerradas,
        cells: [
          { key: "closer.asignadas", value: String(m.asignadas) },
          { key: "closer.confirmadas", value: String(m.confirmadas) },
          { key: "closer.completadas", value: String(m.completadas) },
          { key: "closer.no_interesadas", value: String(m.noInteresadas) },
          { key: "closer.llamadas", value: String(c.count) },
          { key: "closer.qa_avg", value: avgQa != null ? `${avgQa}/100` : "—" },
          { key: "closer.cerradas", value: String(c.cerradas) },
          { key: "closer.no_cerradas", value: String(c.noCerradas) },
        ],
      };
    })
    // "Sin asignar" sólo aparece si hay actividad en el rango. Si todas
    // las métricas son 0, sería ruido — un row vacío al final del
    // reporte sin valor informativo.
    .filter((row) => {
      if (row.user_id !== null) return true;
      return row.cells.some(
        (cell) => cell.value !== "0" && cell.value !== "—",
      );
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
  roleName?: string | null;
}): string {
  const { name, module, period, from, to, rows, metrics, roleName } = args;
  const fromLabel = fmtMiami(from);
  const toLabel = fmtMiami(to);

  // Clamp defensivo: si el schedule tiene metrics, solo aceptamos las
  // que pertenezcan al módulo correcto. Esto protege contra schedules
  // antiguos creados antes del módulo de validación frontend (o data
  // corrupta donde module='llg' pero metrics=['closer.*']).
  // Si después del clamp no queda ninguna, fallback al default del módulo.
  const rawMetrics = metrics && metrics.length > 0 ? metrics : null;
  const filtered = rawMetrics?.filter((k) => METRIC_CATALOG[k]?.module === module) ?? [];
  const metricKeys =
    filtered.length > 0 ? filtered : DEFAULT_METRICS_BY_MODULE[module];

  const colHeaders = ["Persona", ...metricKeys.map((k) => METRIC_CATALOG[k]?.label ?? k)];

  // Padding compacto + font-size chico para que entren hasta 8 columnas
  // sin que Gmail recorte. mso-line-height para Outlook.
  const cellPad = "5px 6px";
  const cellHtmlBase = `padding:${cellPad};font-variant-numeric:tabular-nums;color:#111827;white-space:nowrap;`;

  const tableRows = rows
    .map((r) => {
      const cellsByKey: Record<string, string> = {};
      for (const c of r.cells) cellsByKey[c.key] = c.value;
      const cellsHtml = metricKeys
        .map(
          (k) =>
            `<td style="${cellHtmlBase}text-align:right;">${escapeHtml(cellsByKey[k] ?? "—")}</td>`,
        )
        .join("");
      return `<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:${cellPad};font-weight:600;color:#111827;">${escapeHtml(r.name)}</td>${cellsHtml}</tr>`;
    })
    .join("");

  const emptyState = rows.length === 0
    ? `<tr><td colspan="${colHeaders.length}" style="padding:24px;text-align:center;color:#6b7280;font-style:italic;">Sin actividad registrada en el rango${roleName ? ` para el rol "${escapeHtml(roleName)}"` : ""}.</td></tr>`
    : "";

  // Línea de contexto debajo del título: rol si está, sino fallback al
  // módulo (compat con schedules legacy sin role_name).
  const contextLine = roleName
    ? `Rol: <strong>${escapeHtml(roleName)}</strong>`
    : `Módulo: <strong>${MODULE_LABEL[module]}</strong>`;

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:720px;margin:0;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:linear-gradient(135deg,#6d28d9,#4338ca);padding:24px 22px;color:#ffffff;">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;opacity:0.85;text-transform:uppercase;">Maven CRM · Reporte ${PERIOD_LABEL[period]}</div>
        <h1 style="font-size:22px;font-weight:700;margin:6px 0 0;line-height:1.3;">${escapeHtml(name)}</h1>
        <!-- Usamos table en vez de p+br para evitar que Gmail colapse
             líneas como "Trimmed content" entre emails del mismo schedule. -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#ffffff;">
          <tr><td style="padding:0;opacity:0.9;">${contextLine}</td></tr>
          <tr><td style="padding:0;opacity:0.9;">Rango (hora Miami): <strong>${fromLabel} → ${toLabel}</strong></td></tr>
        </table>
      </div>
      <div style="padding:16px 14px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:auto;">
          <thead>
            <tr style="background:#f9fafb;color:#374151;text-transform:uppercase;font-size:9px;letter-spacing:0.6px;">
              ${colHeaders.map((h, i) => `<th style="padding:8px 6px;text-align:${i === 0 ? "left" : "right"};font-weight:700;white-space:nowrap;">${escapeHtml(h)}</th>`).join("")}
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

// Helper interno: arma SOLO la tabla (sin header / footer / wrapper),
// para reuso desde renderCombinedReportHtml. Espejo del cuerpo de
// renderReportHtml.
function renderTableSection(args: {
  module: Module;
  rows: MetricRow[];
  metrics: string[] | null;
  sectionTitle: string;
}): string {
  const { module, rows, metrics, sectionTitle } = args;

  const rawMetrics = metrics && metrics.length > 0 ? metrics : null;
  const filtered = rawMetrics?.filter((k) => METRIC_CATALOG[k]?.module === module) ?? [];
  const metricKeys =
    filtered.length > 0 ? filtered : DEFAULT_METRICS_BY_MODULE[module];

  const colHeaders = ["Persona", ...metricKeys.map((k) => METRIC_CATALOG[k]?.label ?? k)];
  const cellPad = "5px 6px";
  const cellHtmlBase = `padding:${cellPad};font-variant-numeric:tabular-nums;color:#111827;white-space:nowrap;`;

  const tableRows = rows
    .map((r) => {
      const cellsByKey: Record<string, string> = {};
      for (const c of r.cells) cellsByKey[c.key] = c.value;
      const cellsHtml = metricKeys
        .map((k) => `<td style="${cellHtmlBase}text-align:right;">${escapeHtml(cellsByKey[k] ?? "—")}</td>`)
        .join("");
      return `<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:${cellPad};font-weight:600;color:#111827;">${escapeHtml(r.name)}</td>${cellsHtml}</tr>`;
    })
    .join("");

  const emptyState = rows.length === 0
    ? `<tr><td colspan="${colHeaders.length}" style="padding:24px;text-align:center;color:#6b7280;font-style:italic;">Sin actividad en el rango.</td></tr>`
    : "";

  // Mezclamos header + tabla en UN solo <table> con un <thead> de
  // dos filas (título de sección + columnas). Esto evita el chip
  // "trimmed content" de Gmail, que aparece cuando hay <div> sueltos
  // entre tablas — Gmail los interpreta como contenido cuoteado y
  // los colapsa. El header principal del email ya usa este patrón.
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;table-layout:auto;margin-top:18px;">
      <thead>
        <tr>
          <th colspan="${colHeaders.length}" style="text-align:left;padding:8px 6px 10px;font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#4338ca;border-bottom:2px solid #ede9fe;">
            ${escapeHtml(sectionTitle)}
          </th>
        </tr>
        <tr style="background:#f9fafb;color:#374151;text-transform:uppercase;font-size:9px;letter-spacing:0.6px;">
          ${colHeaders.map((h, i) => `<th style="padding:8px 6px;text-align:${i === 0 ? "left" : "right"};font-weight:700;white-space:nowrap;">${escapeHtml(h)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>${tableRows}${emptyState}</tbody>
    </table>
  `;
}

// Reporte combinado: header único + N secciones, una por rol elegido
// en el modal. El admin define qué roles vía `combined_roles` (text[]).
function renderCombinedReportHtml(args: {
  name: string;
  period: Period;
  from: string;
  to: string;
  sections: Array<{ role: string; module: Exclude<Module, "combined">; rows: MetricRow[] }>;
  metrics: string[] | null;
}): string {
  const { name, period, from, to, sections, metrics } = args;
  const fromLabel = fmtMiami(from);
  const toLabel = fmtMiami(to);

  const sectionsHtml = sections
    .map((s) =>
      renderTableSection({
        module: s.module,
        rows: s.rows,
        metrics,
        // Mostramos el rol como título de la sección — el rol es lo
        // que el admin entiende ("LLG", "closer", "Chatter Supervisor").
        sectionTitle: s.role,
      }),
    )
    .join("");

  // Línea de descripción: lista los roles incluidos (max 3 visibles + "y N más")
  const roleList = sections.map((s) => s.role).slice(0, 3).join(" + ");
  const extra = sections.length > 3 ? ` (+${sections.length - 3} más)` : "";

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:720px;margin:0;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:linear-gradient(135deg,#6d28d9,#4338ca);padding:24px 22px;color:#ffffff;">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;opacity:0.85;text-transform:uppercase;">Maven CRM · Reporte ${PERIOD_LABEL[period]} combinado</div>
        <h1 style="font-size:22px;font-weight:700;margin:6px 0 0;line-height:1.3;">${escapeHtml(name)}</h1>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#ffffff;">
          <tr><td style="padding:0;opacity:0.9;">Roles: <strong>${escapeHtml(roleList)}${extra}</strong></td></tr>
          <tr><td style="padding:0;opacity:0.9;">Rango (hora Miami): <strong>${fromLabel} → ${toLabel}</strong></td></tr>
        </table>
      </div>
      <div style="padding:16px 14px;">
        ${sectionsHtml}
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
