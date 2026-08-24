import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Totales por DÍA y por MES de creator_daily_earnings, agregados SERVER-SIDE
// (RPCs get_sales_daily_totals / get_sales_monthly_totals). Antes /sales-overview
// se bajaba el histórico COMPLETO (~40.9k filas, ~13MB, 43 requests) para pintar
// un mes; ahora los charts reciben 1 fila por día del rango y el sparkline 1 por mes.
//
// Cifras de referencia (verificadas contra creator_daily_earnings, 2026-08-24):
//   agosto 1-24: total_gross = $299,006.34
//   julio  1-24: total_gross = $415,124  → comparativa justa = −28.0%
// (la comparativa vieja mes-parcial vs mes-completo daba −43.4%; de ahí el clamp a
//  días equivalentes que hace buildComparisonRanges en usePeriodComparison.ts).

export interface SalesDailyTotal {
  date: string; // yyyy-MM-dd
  total_gross: number;
  subscription_gross: number;
  tips_gross: number;
  message_gross: number;
}

export interface SalesMonthlyTotal {
  month: string; // yyyy-MM-dd (día 1 del mes)
  total_gross: number;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

// Los RPCs son management-only (blu_is_management). Un usuario sin permiso recibe
// 42501 (insufficient_privilege) → devolvemos [] como hace useDashboard2Summary.
const isForbidden = (error: { code?: string; message?: string }) =>
  error.code === "42501" || /forbidden/i.test(error.message ?? "");

const fetchDailyTotals = async (from: string, to: string): Promise<SalesDailyTotal[]> => {
  const { data, error } = await (supabase as any).rpc("get_sales_daily_totals", {
    p_from: from,
    p_to: to,
  });
  if (error) {
    if (isForbidden(error)) return [];
    throw error;
  }
  // numeric de Postgres puede llegar como string vía PostgREST → normalizamos a number.
  return ((data ?? []) as any[]).map((r): SalesDailyTotal => ({
    date: r.date,
    total_gross: num(r.total_gross),
    subscription_gross: num(r.subscription_gross),
    tips_gross: num(r.tips_gross),
    message_gross: num(r.message_gross),
  }));
};

const fetchMonthlyTotals = async (months: number): Promise<SalesMonthlyTotal[]> => {
  const { data, error } = await (supabase as any).rpc("get_sales_monthly_totals", {
    p_months: months,
  });
  if (error) {
    if (isForbidden(error)) return [];
    throw error;
  }
  return ((data ?? []) as any[]).map((r): SalesMonthlyTotal => ({
    month: r.month,
    total_gross: num(r.total_gross),
  }));
};

// staleTime alto: el bridge de BLU importa 1×/día, no tiene sentido re-pedir por navegar.
const STALE_MS = 30 * 60_000;

/** Totales por día para [from, to] (1 fila por día con datos). */
export const useSalesDailyTotals = (from?: string, to?: string, enabled = true) =>
  useQuery({
    queryKey: ["sales_daily_totals", from, to],
    enabled: enabled && !!from && !!to,
    staleTime: STALE_MS,
    queryFn: () => fetchDailyTotals(from!, to!),
  });

/** Total bruto por mes de los últimos `months` meses (incluye el mes en curso, parcial). */
export const useSalesMonthlyTotals = (months: number, enabled = true) =>
  useQuery({
    queryKey: ["sales_monthly_totals", months],
    enabled,
    staleTime: STALE_MS,
    queryFn: () => fetchMonthlyTotals(months),
  });
