import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Esfuerzo (Hubstaff) × Resultado (BLU) por chatter. Lee la vista v_chatter_hubstaff_effort
// (security_invoker → solo management la ve). El hallazgo: actividad% sola no es productividad;
// cruzada con ventas + tiempo de respuesta detecta el "online pero improductivo".
// Tabla nueva → casteamos (supabase as any), igual que el resto de hooks de sales-performance.

export interface HubstaffEffortRow {
  blu_employee_id: number;
  name: string;
  period: string;
  days_tracked: number;
  total_hours: number;
  avg_activity_pct: number;
  sales: number;
  sales_per_hour: number;
  avg_response_min: number | null;
  unlock_rate: number | null;
  sold_messages: number | null;
  fans_chatted: number | null;
  online_improductivo: boolean;
}

// Estado del sync del bridge (para mostrar "actualizado hace X").
export const useHubstaffSyncStatus = () =>
  useQuery({
    queryKey: ["hubstaff-sync-status"],
    queryFn: async (): Promise<{ last_sync_at: string | null } | null> => {
      const { data, error } = await (supabase as any)
        .from("hubstaff_config")
        .select("last_sync_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    staleTime: 60_000,
  });

// Filas de esfuerzo-vs-resultado del período más reciente con datos (o el período dado).
export const useHubstaffEffort = (period?: string | null) =>
  useQuery({
    queryKey: ["hubstaff-effort", period ?? "latest"],
    queryFn: async (): Promise<HubstaffEffortRow[]> => {
      let q = (supabase as any).from("v_chatter_hubstaff_effort").select("*");
      if (period) q = q.eq("period", period);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as HubstaffEffortRow[];
      // Si no se fijó período, quedarse con el más reciente que tenga datos.
      if (!period && rows.length) {
        const latest = rows.reduce((m, r) => (r.period > m ? r.period : m), rows[0].period);
        rows = rows.filter((r) => r.period === latest);
      }
      return rows.sort((a, b) => (b.sales_per_hour ?? 0) - (a.sales_per_hour ?? 0));
    },
    staleTime: 60_000,
  });
