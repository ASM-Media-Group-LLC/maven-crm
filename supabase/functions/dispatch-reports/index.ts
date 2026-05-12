// dispatch-reports — corre diario 8am Miami via pg_cron. Mira los
// report_schedules ACTIVOS y decide cuáles disparar HOY según su period:
//   · daily   → todos los días
//   · weekly  → si hoy es lunes (Miami)
//   · monthly → si hoy es día 1 (Miami)
//   · annual  → si hoy es 1-ene (Miami)
//
// Para cada match calcula el rango exacto (start/end ISO) que cubre el
// reporte y llama a send-report con { schedule_id, from, to }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIAMI_TZ = "America/New_York";

// Hora "now" en Miami descompuesta en partes.
function miamiParts(d: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: MIAMI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour: parseInt(parts.hour, 10),
    weekday: parts.weekday, // 'Mon', 'Tue', ...
  };
}

// Devuelve el offset de Miami en minutos (negativo en EST = -300, EDT = -240).
function miamiOffsetMinutes(d: Date): number {
  // Trick: compara local-formatted Miami time vs UTC.
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const miami = new Date(d.toLocaleString("en-US", { timeZone: MIAMI_TZ }));
  return (miami.getTime() - utc.getTime()) / 60_000;
}

// Construye un Date UTC que representa "Y-M-D H:m:s" en hora Miami.
function miamiDateToUtc(year: number, month: number, day: number, hour: number, min: number, sec: number): Date {
  // Truco: crear una fecha "naive" en UTC, leer cuánto difiere con Miami
  // y compensar el offset.
  const naive = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
  const offsetMin = miamiOffsetMinutes(naive);
  // Si Miami = UTC - 4 (EDT), offsetMin = -240. Para que el tiempo
  // miami-naive sea correcto en UTC, sumamos -offsetMin.
  return new Date(naive.getTime() - offsetMin * 60_000);
}

// Calcula el rango (from, to) ISO UTC que cubre el reporte ejecutado HOY
// para un period dado. Asume que el cron corre 8am Miami; usamos eso
// como "now".
function computeRange(period: "daily" | "weekly" | "monthly" | "annual", now: Date): { from: string; to: string } {
  const m = miamiParts(now);

  if (period === "daily") {
    // Ayer 00:00 → ayer 23:59:59.999 Miami
    const yesterday = new Date(Date.UTC(m.year, m.month - 1, m.day));
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const y = yesterday.getUTCFullYear();
    const mo = yesterday.getUTCMonth() + 1;
    const d = yesterday.getUTCDate();
    const from = miamiDateToUtc(y, mo, d, 0, 0, 0);
    const to = miamiDateToUtc(y, mo, d, 23, 59, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  if (period === "weekly") {
    // Semana pasada: lunes 00:00 → domingo 23:59:59 Miami.
    // "Hoy" Miami debería ser lunes (gating ya filtra eso).
    const todayUtc = new Date(Date.UTC(m.year, m.month - 1, m.day));
    const lastMonday = new Date(todayUtc.getTime() - 7 * 86_400_000);
    const lastSunday = new Date(todayUtc.getTime() - 1 * 86_400_000);
    const from = miamiDateToUtc(lastMonday.getUTCFullYear(), lastMonday.getUTCMonth() + 1, lastMonday.getUTCDate(), 0, 0, 0);
    const to = miamiDateToUtc(lastSunday.getUTCFullYear(), lastSunday.getUTCMonth() + 1, lastSunday.getUTCDate(), 23, 59, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  if (period === "monthly") {
    // Mes pasado: día 1 00:00 → último día 23:59:59 Miami.
    const prevMonth = m.month === 1 ? 12 : m.month - 1;
    const prevYear = m.month === 1 ? m.year - 1 : m.year;
    const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate(); // día 0 del mes siguiente = último del actual
    const from = miamiDateToUtc(prevYear, prevMonth, 1, 0, 0, 0);
    const to = miamiDateToUtc(prevYear, prevMonth, lastDay, 23, 59, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  // annual: año pasado.
  const prevYear = m.year - 1;
  const from = miamiDateToUtc(prevYear, 1, 1, 0, 0, 0);
  const to = miamiDateToUtc(prevYear, 12, 31, 23, 59, 59);
  return { from: from.toISOString(), to: to.toISOString() };
}

// Decide si un schedule debe dispararse AHORA según period + dispatch_hour.
// El cron corre cada hora; chequeamos period para "hoy es el día" y
// dispatch_hour para "es esta hora".
function shouldDispatchNow(
  period: "daily" | "weekly" | "monthly" | "annual",
  dispatchHour: number,
  now: Date,
): boolean {
  const m = miamiParts(now);
  if (m.hour !== dispatchHour) return false;
  if (period === "daily") return true;
  if (period === "weekly") return m.weekday === "Mon";
  if (period === "monthly") return m.day === 1;
  if (period === "annual") return m.day === 1 && m.month === 1;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth via X-Cron-Token (pg_cron lo pasa desde vault; frontend admin
  // future-uso lo pasaría por edge function privada).
  const cronToken = req.headers.get("X-Cron-Token");
  const expected = Deno.env.get("CRON_INTERNAL_TOKEN");
  if (!expected || cronToken !== expected) {
    console.warn("[dispatch-reports] invalid or missing X-Cron-Token");
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: schedules, error } = await admin
      .from("report_schedules")
      .select("id, period, dispatch_hour, is_active")
      .eq("is_active", true);
    if (error) throw error;

    const now = new Date();
    const due = (schedules ?? []).filter((s: any) =>
      shouldDispatchNow(s.period as any, Number(s.dispatch_hour ?? 8), now),
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const results: Array<{ schedule_id: string; ok: boolean; error?: string }> = [];
    for (const s of due) {
      const { from, to } = computeRange(s.period as any, now);
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-report`, {
          method: "POST",
          headers: {
            "X-Cron-Token": expected,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ schedule_id: s.id, from, to }),
        });
        const ok = resp.ok;
        const body = ok ? "" : await resp.text().catch(() => "");
        results.push({ schedule_id: s.id, ok, error: ok ? undefined : body.slice(0, 200) });
      } catch (e) {
        results.push({ schedule_id: s.id, ok: false, error: (e as Error).message });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total_active: schedules?.length ?? 0,
        dispatched: due.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[dispatch-reports] exception:", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
