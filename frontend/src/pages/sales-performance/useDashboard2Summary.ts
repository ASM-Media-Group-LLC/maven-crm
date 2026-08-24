import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Resumen POR CREADORA de creator_daily_earnings para un rango, agregado SERVER-SIDE
// por el RPC get_dashboard2_creator_summary. Reemplaza el patrón viejo (bajar el
// histórico crudo — hoy ~41k filas — en decenas de requests sin caché y agregar en JS):
// ahora 1 request, ~80 filas. Lo usan Dashboard 2 y /sales-overview (2 llamadas
// paralelas: período actual + período anterior equivalente).
export interface Dash2Summary {
  group_key: string;
  creator_id: string | null;
  blu_creator_name: string | null;
  artistic_name: string | null;
  total: number;
  subs: number;
  new_sub: number;
  recurring_sub: number;
  tips: number;
  messages: number;
  max_active_fans: number;
  new_fans: number;
  days_with_data: number;
  last_date: string | null;
  af_sum: number;
  af_days: number;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

const fetchSummary = async (from: string, to: string): Promise<Dash2Summary[]> => {
  const { data, error } = await (supabase as any).rpc("get_dashboard2_creator_summary", {
    p_from: from,
    p_to: to,
  });
  // El RPC es management-only (blu_is_management). Un usuario sin permiso recibe 42501
  // (insufficient_privilege) → devolvemos [] como hacía la RLS antes (sin romper la UI).
  if (error) {
    if (error.code === "42501" || /forbidden/i.test(error.message ?? "")) return [];
    throw error;
  }
  // numeric de Postgres puede llegar como string vía PostgREST → normalizamos a number.
  return ((data ?? []) as any[]).map((r): Dash2Summary => ({
    group_key: r.group_key,
    creator_id: r.creator_id ?? null,
    blu_creator_name: r.blu_creator_name ?? null,
    artistic_name: r.artistic_name ?? null,
    total: num(r.total),
    subs: num(r.subs),
    new_sub: num(r.new_sub),
    recurring_sub: num(r.recurring_sub),
    tips: num(r.tips),
    messages: num(r.messages),
    max_active_fans: num(r.max_active_fans),
    new_fans: num(r.new_fans),
    days_with_data: num(r.days_with_data),
    last_date: r.last_date ?? null,
    af_sum: num(r.af_sum),
    af_days: num(r.af_days),
  }));
};

/** Resumen por creadora para [from, to]. Cacheado (la data de BLU se refresca 1×/día). */
export const useDashboard2Summary = (from?: string, to?: string, enabled = true) =>
  useQuery({
    queryKey: ["dashboard2_summary", from, to],
    enabled: enabled && !!from && !!to,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchSummary(from!, to!),
  });
