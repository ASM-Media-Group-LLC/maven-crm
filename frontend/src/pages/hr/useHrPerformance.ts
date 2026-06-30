import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Performance operativo de RRHH: reúne las vistas de productividad por rol (mismas que QA),
// tomando el último período de cada una. management-only. Sin DB nueva — solo lectura.

const latest = <T extends { period: string }>(rows: T[]): T[] => {
  if (!rows.length) return rows;
  const max = rows.reduce((m, r) => (r.period > m ? r.period : m), rows[0].period);
  return rows.filter((r) => r.period === max);
};

export interface ChatterPerf {
  blu_employee_id: string; name: string; period: string; total_hours: number; avg_activity_pct: number;
  sales: number; cost_usd: number; agency_revenue_usd: number; margin_usd: number; roi_x: number | null;
  no_rentable: boolean; sin_venta_blu: boolean; unlock_rate: number | null;
}
export interface CloserPerf {
  name: string; period: string; total_hours: number; avg_activity_pct: number;
  leads: number; cerradas: number; monetizacion_usd: number | null; usd_por_hora: number | null;
  qa_calls: number; avg_qa_score: number | null; sin_cierres: boolean;
}
export interface LlgPerf {
  name: string; period: string; total_hours: number; avg_activity_pct: number; leads: number; leads_por_hora: number | null;
}
export interface EffortPerf {
  profile_id: string | null; name: string; role: string; period: string; dias: number; total_hours: number; avg_activity_pct: number;
}

export const useChatterPerf = () =>
  useQuery({
    queryKey: ["hr-perf-chatter"],
    queryFn: async (): Promise<ChatterPerf[]> => {
      const { data, error } = await (supabase as any).from("v_chatter_hubstaff_effort").select("*");
      if (error) throw error;
      return latest((data ?? []) as ChatterPerf[]).sort((a, b) => (b.margin_usd ?? 0) - (a.margin_usd ?? 0));
    },
    staleTime: 60_000,
  });

export const useCloserPerf = () =>
  useQuery({
    queryKey: ["hr-perf-closer"],
    queryFn: async (): Promise<CloserPerf[]> => {
      const { data, error } = await (supabase as any).from("v_closer_hubstaff").select("*");
      if (error) throw error;
      return latest((data ?? []) as CloserPerf[]).sort((a, b) => (b.cerradas ?? 0) - (a.cerradas ?? 0));
    },
    staleTime: 60_000,
  });

export const useLlgPerf = () =>
  useQuery({
    queryKey: ["hr-perf-llg"],
    queryFn: async (): Promise<LlgPerf[]> => {
      const { data, error } = await (supabase as any).from("v_llg_hubstaff").select("*");
      if (error) throw error;
      return latest((data ?? []) as LlgPerf[]).sort((a, b) => (b.leads ?? 0) - (a.leads ?? 0));
    },
    staleTime: 60_000,
  });

// Managers (y cualquier rol) — esfuerzo puro, keyed con profile_id (para linkear a la ficha).
export const useManagerPerf = () =>
  useQuery({
    queryKey: ["hr-perf-manager"],
    queryFn: async (): Promise<EffortPerf[]> => {
      const { data, error } = await (supabase as any).from("v_qa_effort").select("*").eq("role", "manager");
      if (error) throw error;
      return latest((data ?? []) as EffortPerf[]).sort((a, b) => (b.total_hours ?? 0) - (a.total_hours ?? 0));
    },
    staleTime: 60_000,
  });
