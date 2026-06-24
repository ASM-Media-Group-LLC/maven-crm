import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Cohortes de retención de fans para Dashboard v2. La agregación corre 100% en el
// server (RPC dashboard2_cohort_retention sobre creator_fan_retention): el cliente
// solo pivotea el formato largo (cohort_date, day_offset, retention_pct) a una matriz.
// staleTime alto: la data de BLU se actualiza ~1 vez/día.
export interface CohortRow {
  cohort_date: string;       // fecha de alta del grupo
  cohort_size: number;       // fans nuevos en esa cohorte (ponderador)
  cells: (number | null)[];  // % retenido por día-offset (0..N); null = aún no observado
}

interface RpcRow {
  cohort_date: string;
  cohort_size: number | string;
  day_offset: number;
  retention_pct: number | string | null;
}

export const useCohortRetention = (fromStr: string, toStr: string, enabled: boolean) =>
  useQuery({
    queryKey: ["dashboard2_cohort_retention", fromStr, toStr],
    enabled: enabled && !!fromStr && !!toStr,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async (): Promise<{ rows: CohortRow[]; maxOffset: number }> => {
      const { data, error } = await (supabase as any).rpc("dashboard2_cohort_retention", {
        p_from: fromStr,
        p_to: toStr,
      });
      if (error) throw error;
      const raw = (data ?? []) as RpcRow[];
      const maxOffset = raw.reduce((m, r) => Math.max(m, r.day_offset), 0);
      const map = new Map<string, CohortRow>();
      for (const r of raw) {
        let row = map.get(r.cohort_date);
        if (!row) {
          row = { cohort_date: r.cohort_date, cohort_size: Number(r.cohort_size) || 0, cells: Array(maxOffset + 1).fill(null) };
          map.set(r.cohort_date, row);
        }
        row.cells[r.day_offset] = r.retention_pct != null ? Number(r.retention_pct) : null;
      }
      // Más reciente arriba.
      const rows = [...map.values()].sort((a, b) => b.cohort_date.localeCompare(a.cohort_date));
      return { rows, maxOffset };
    },
  });
