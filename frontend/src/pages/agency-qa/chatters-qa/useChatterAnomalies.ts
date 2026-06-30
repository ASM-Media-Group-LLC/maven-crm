import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Anomalías de actividad de chatters (vista v_chatter_anomalies, management-only). Una fila por
// día "raro": baja_actividad (online pero <35%), dia_corto (<2.5h), dia_largo (>12h). Casteo (as any).
export type AnomalyTipo = "baja_actividad" | "dia_corto" | "dia_largo";

export interface ChatterAnomalyRow {
  blu_employee_id: number;
  name: string;
  period: string;
  date: string;
  hours: number;
  act: number;
  tipo: AnomalyTipo;
}

export const useChatterAnomalies = (period?: string | null) =>
  useQuery({
    queryKey: ["chatter-anomalies", period ?? "latest"],
    queryFn: async (): Promise<ChatterAnomalyRow[]> => {
      let q = (supabase as any).from("v_chatter_anomalies").select("*");
      if (period) q = q.eq("period", period);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as ChatterAnomalyRow[];
      if (!period && rows.length) {
        const latest = rows.reduce((m, r) => (r.period > m ? r.period : m), rows[0].period);
        rows = rows.filter((r) => r.period === latest);
      }
      // Más reciente primero.
      return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name)));
    },
    staleTime: 60_000,
  });
