import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Total por MES de creator_daily_earnings, agregado SERVER-SIDE (RPC
// get_sales_monthly_totals) para el sparkline de "Comparativas": 1 fila por mes.
// (El de por-día se retiró junto con los charts de /sales-overview.)
//
// Cifras de referencia (verificadas contra creator_daily_earnings, 2026-08-24):
//   agosto 1-24: total_gross = $299,006.34
//   julio  1-24: total_gross = $415,124  → comparativa justa = −28.0%
// (la comparativa vieja mes-parcial vs mes-completo daba −43.4%; de ahí el clamp a
//  días equivalentes que hace buildComparisonRanges en usePeriodComparison.ts).

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

/** Total bruto por mes de los últimos `months` meses (incluye el mes en curso, parcial). */
export const useSalesMonthlyTotals = (months: number, enabled = true) =>
  useQuery({
    queryKey: ["sales_monthly_totals", months],
    enabled,
    staleTime: STALE_MS,
    queryFn: () => fetchMonthlyTotals(months),
  });
