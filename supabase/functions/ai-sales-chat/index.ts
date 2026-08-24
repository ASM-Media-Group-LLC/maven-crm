import { corsFor } from "../_shared/cors.ts";
// IA Ventas — chat con datos de creadoras + earnings.
//
// Cambios respecto a la versión anterior:
//   - Dropped Groq. Usa Gemini (gemini-2.5-flash) vía streamGeminiAsOpenAI
//     del shared, igual que clari-help.
//   - System prompt reducido ~95% (de ~30k a ~1.5k tokens) usando
//     agregaciones server-side en formato compacto en vez de inyectar
//     todos los earnings raw + creators full JSON.
//
// Cobertura del prompt compacto:
//   - Resúmenes por período: hoy / esta semana / sem. anterior /
//     este mes / mes anterior. Cubre 90% de preguntas tipo "¿cómo va
//     la semana?" o "comparame con el mes pasado".
//   - Top 10 creadoras del mes (por gross). Cubre rankings.
//   - Top 5 subiendo / top 5 bajando (semana vs sem. anterior). Cubre
//     "¿quién está creciendo / cayendo?".
//   - Lista compacta de activas (id|name|cat). Cubre filtros por
//     categoría / lookups por nombre.
//
// Para preguntas más profundas (ej. "muéstrame el desglose diario de
// María") el prompt instruye al modelo a redirigir al dashboard
// /sales-overview en vez de inventar datos.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { format } from "https://esm.sh/date-fns@3.6.0";
import { streamGeminiAsOpenAI } from "../_shared/gemini.ts";

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" });

// Mapea registros del cierre de día (00:00–00:55) al día anterior.
// Mismo helper que el dashboard usa para que los totales coincidan.
const computeEffectiveDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  if (d.getHours() === 0 && d.getMinutes() <= 55) {
    const prev = new Date(d);
    prev.setDate(prev.getDate() - 1);
    return format(prev, "yyyy-MM-dd");
  }
  return format(d, "yyyy-MM-dd");
};

interface EarningRow {
  id: string;
  date: string;
  creator_id: string | null;
  pending_creator: string | null;
  total_earnings_gross: number | null;
  effective_date?: string;
}

interface CreatorRow {
  id: string;
  name: string | null;
  artistic_name: string | null;
  status: string | null;
  category: string | null;
}

const EARNINGS_BATCH_SIZE = 1000;

// Sólo trae los últimos ~60 días — suficiente para los buckets que
// inyectamos (today / week / prev week / month / prev month).
const fetchRecentEarnings = async (
  supabase: any,
  sinceDate: string,
): Promise<EarningRow[]> => {
  let offset = 0;
  const all: EarningRow[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("of_gross_earnings")
      .select("id, date, total_earnings_gross, creator_id, pending_creator")
      .gte("date", sinceDate)
      .order("date", { ascending: false })
      .range(offset, offset + EARNINGS_BATCH_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as EarningRow[];
    all.push(...batch);
    if (batch.length < EARNINGS_BATCH_SIZE) break;
    offset += EARNINGS_BATCH_SIZE;
  }
  return all;
};

// Dedupe por (creator|pending_creator, effective_date) — quedarse con
// el último registro del día (el más cercano al cierre).
const dedupeByCreatorDay = (rows: EarningRow[]): EarningRow[] => {
  const grouped = new Map<string, EarningRow>();
  for (const row of rows) {
    const creatorKey = row.creator_id || row.pending_creator || row.id;
    const key = `${creatorKey}__${row.effective_date}`;
    const existing = grouped.get(key);
    if (!existing || new Date(row.date) > new Date(existing.date)) {
      grouped.set(key, row);
    }
  }
  return Array.from(grouped.values());
};

// Helpers de formato compacto. Redondear y abreviar miles ahorra tokens
// y hace los números más legibles para humanos también.
const fmtMoney = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};
const fmtPct = (n: number): string => `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;

interface PeriodTotals {
  total: number;
  creators: number;
}

const sumInRange = (
  rows: EarningRow[],
  from: string,
  to: string,
): PeriodTotals => {
  let total = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const d = r.effective_date ?? "";
    if (d < from || d > to) continue;
    total += r.total_earnings_gross ?? 0;
    seen.add(r.creator_id || r.pending_creator || r.id);
  }
  return { total, creators: seen.size };
};

const groupByCreator = (
  rows: EarningRow[],
  creatorMap: Record<string, string>,
): Map<string, number> => {
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = r.creator_id ? creatorMap[r.creator_id] || r.creator_id : r.pending_creator || "Sin nombre";
    out.set(key, (out.get(key) ?? 0) + (r.total_earnings_gross ?? 0));
  }
  return out;
};

const buildSystemPrompt = (
  creators: CreatorRow[],
  earnings: EarningRow[],
): string => {
  // Calculamos las fechas relevantes en TZ del servidor (Edge UTC).
  // Para el agente esto es suficiente: las preguntas de "hoy" /
  // "esta semana" se interpretan con el mismo cutoff que el dashboard.
  const today = format(new Date(), "yyyy-MM-dd");
  const now = new Date();

  const dayMs = 24 * 60 * 60 * 1000;
  const weekStart = format(new Date(now.getTime() - 6 * dayMs), "yyyy-MM-dd");
  const prevWeekEnd = format(new Date(now.getTime() - 7 * dayMs), "yyyy-MM-dd");
  const prevWeekStart = format(new Date(now.getTime() - 13 * dayMs), "yyyy-MM-dd");

  const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
  const prevMonthStart = format(new Date(now.getFullYear(), now.getMonth() - 1, 1), "yyyy-MM-dd");
  const prevMonthEnd = format(new Date(now.getFullYear(), now.getMonth(), 0), "yyyy-MM-dd");

  const creatorMap: Record<string, string> = {};
  for (const c of creators) creatorMap[c.id] = c.artistic_name || c.name || c.id;

  // Period totals (compactos).
  const todayTotals = sumInRange(earnings, today, today);
  const weekTotals = sumInRange(earnings, weekStart, today);
  const prevWeekTotals = sumInRange(earnings, prevWeekStart, prevWeekEnd);
  const monthTotals = sumInRange(earnings, monthStart, today);
  const prevMonthTotals = sumInRange(earnings, prevMonthStart, prevMonthEnd);

  // Top 10 del mes (por gross acumulado).
  const monthRows = earnings.filter(
    (r) => (r.effective_date ?? "") >= monthStart && (r.effective_date ?? "") <= today,
  );
  const monthByCreator = groupByCreator(monthRows, creatorMap);
  const top10Month = Array.from(monthByCreator.entries())
    .filter(([_, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Subiendo/bajando: semana vs semana anterior.
  const weekRows = earnings.filter(
    (r) => (r.effective_date ?? "") >= weekStart && (r.effective_date ?? "") <= today,
  );
  const prevWeekRows = earnings.filter(
    (r) => (r.effective_date ?? "") >= prevWeekStart && (r.effective_date ?? "") <= prevWeekEnd,
  );
  const weekByCreator = groupByCreator(weekRows, creatorMap);
  const prevWeekByCreator = groupByCreator(prevWeekRows, creatorMap);

  const allCreatorsThisWeek = new Set([...weekByCreator.keys(), ...prevWeekByCreator.keys()]);
  const changes: { name: string; cur: number; prev: number; pct: number }[] = [];
  for (const name of allCreatorsThisWeek) {
    const cur = weekByCreator.get(name) ?? 0;
    const prev = prevWeekByCreator.get(name) ?? 0;
    if (cur === 0 && prev === 0) continue;
    if (prev === 0) continue; // skip "nuevo" — ruido
    const pct = ((cur - prev) / prev) * 100;
    changes.push({ name, cur, prev, pct });
  }
  const subiendo = [...changes].filter((c) => c.cur >= 100).sort((a, b) => b.pct - a.pct).slice(0, 5);
  const bajando = [...changes].filter((c) => c.prev >= 100).sort((a, b) => a.pct - b.pct).slice(0, 5);

  // Lista compacta de activas: id|name|cat. Solo nombre + categoría
  // — eso alcanza para preguntas tipo "¿quiénes son las B+?".
  const activeCreators = creators.filter((c) => !c.status || c.status === "active");
  const compactCreatorsList = activeCreators
    .map((c) => `${c.artistic_name || c.name || "—"}${c.category ? `(${c.category})` : ""}`)
    .join(", ");

  return `Eres asistente de ventas para una agencia de creadoras de OnlyFans. Audiencia: vendedores. Responde SIEMPRE en español.

REGLAS:
- Para rankings, comparativas, listas → usa tablas markdown con encabezados, separadores |---| y filas en líneas separadas.
- Números compactos: $1.2k, $14.7k, $2.3M. Sin decimales innecesarios.
- Tendencias con emojis: 📈 sube, 📉 baja, ➡️ igual.
- Bullets cortos. NO párrafos largos. Lenguaje de vendedor, no de analista.
- Si te preguntan algo que requiera datos crudos por día/creadora que NO están abajo, di: "Para ese desglose detallado, consulta el dashboard de Ventas". NO inventes números.

DATOS (mes en curso ${monthStart} → ${today}):

Resúmenes:
- Hoy ${today}: ${fmtMoney(todayTotals.total)} (${todayTotals.creators} creadoras)
- Esta semana (${weekStart} → ${today}): ${fmtMoney(weekTotals.total)} (${weekTotals.creators} creadoras)
- Semana anterior (${prevWeekStart} → ${prevWeekEnd}): ${fmtMoney(prevWeekTotals.total)} (${prevWeekTotals.creators} creadoras)
- Este mes (${monthStart} → ${today}): ${fmtMoney(monthTotals.total)} (${monthTotals.creators} creadoras)
- Mes anterior (${prevMonthStart} → ${prevMonthEnd}): ${fmtMoney(prevMonthTotals.total)} (${prevMonthTotals.creators} creadoras)

Top 10 del mes (gross acumulado):
${top10Month.length === 0 ? "(sin datos)" : top10Month.map(([name, v], i) => `${i + 1}. ${name}: ${fmtMoney(v)}`).join("\n")}

Subiendo (esta sem. vs anterior):
${subiendo.length === 0 ? "(sin movimiento relevante)" : subiendo.map((c) => `${c.name}: ${fmtMoney(c.cur)} ${fmtPct(c.pct)}`).join(", ")}

Bajando (esta sem. vs anterior):
${bajando.length === 0 ? "(sin movimiento relevante)" : bajando.map((c) => `${c.name}: ${fmtMoney(c.cur)} ${fmtPct(c.pct)}`).join(", ")}

Creadoras activas (${activeCreators.length}, formato nombre(categoría)):
${compactCreatorsList || "(sin activas)"}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    // ===== AUTH (igual que la versión anterior) =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido o expirado" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    // ===== END AUTH =====

    const { messages } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY no configurada en los secrets de Supabase." }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }
    const geminiModel = Deno.env.get("AI_SALES_GEMINI_MODEL") || "gemini-2.5-flash";

    // Service role para leer de_gross_earnings + creators (RLS bypass).
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Solo necesitamos ~45 días para cubrir mes en curso + mes
    // anterior + sem. anterior. Cortar el query temprano vs traer
    // todo ahorra ~80% de DB read.
    const sinceDate = format(
      new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      "yyyy-MM-dd",
    );

    const [{ data: creators }, earningsRaw] = await Promise.all([
      supabase
        .from("creators")
        .select("id, name, artistic_name, status, category"),
      fetchRecentEarnings(supabase, sinceDate),
    ]);

    const earnings = earningsRaw.map((e) => ({
      ...e,
      effective_date: computeEffectiveDate(e.date),
    }));
    const deduped = dedupeByCreatorDay(earnings);

    const systemPrompt = buildSystemPrompt(
      (creators ?? []) as CreatorRow[],
      deduped,
    );

    return streamGeminiAsOpenAI({
      apiKey: GEMINI_API_KEY,
      model: geminiModel,
      systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: 0.4,
      maxOutputTokens: 1200,
      corsHeaders: corsHeaders(req),
    });
  } catch (e) {
    console.error("ai-sales-chat error:", e);
    const msg = (e as Error)?.message ?? "Error interno del servidor";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
