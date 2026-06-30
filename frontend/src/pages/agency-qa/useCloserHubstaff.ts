import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Esfuerzo (Hubstaff) × Cierre (pipeline + QA) por closer (vista v_closer_hubstaff, management-only).
// Vista nueva → casteo (supabase as any).
export interface CloserHubstaffRow {
  name: string;
  period: string;
  dias: number;
  total_hours: number;
  avg_activity_pct: number;
  leads: number;
  cerradas: number;
  monetizacion_usd: number;
  usd_por_hora: number;
  qa_calls: number;
  avg_qa_score: number | null;
  sin_cierres: boolean;
}

export const useCloserHubstaff = (period?: string | null) =>
  useQuery({
    queryKey: ["closer-hubstaff", period ?? "latest"],
    queryFn: async (): Promise<CloserHubstaffRow[]> => {
      let q = (supabase as any).from("v_closer_hubstaff").select("*");
      if (period) q = q.eq("period", period);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as CloserHubstaffRow[];
      if (!period && rows.length) {
        const latest = rows.reduce((m, r) => (r.period > m ? r.period : m), rows[0].period);
        rows = rows.filter((r) => r.period === latest);
      }
      // Más monetización primero.
      return rows.sort((a, b) => (b.monetizacion_usd ?? 0) - (a.monetizacion_usd ?? 0));
    },
    staleTime: 60_000,
  });
