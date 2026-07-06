import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

// Dashboard de actividad de Closers. Lee las RPCs get_closer_activity /
// get_closer_activity_detail (migración 20260706120000). El gate por rol
// (admin/manager ven a todos; el closer solo se ve a sí mismo) vive en la
// función SQL — acá solo filtramos client-side cuando el admin usa "Ver como".
//
// Las fechas se mandan como 'yyyy-MM-dd' en hora LOCAL (no toISOString, que
// las corre a UTC). La RPC agrupa por día en zona America/Bogota, así que el
// día del calendario que el user pickeó es el que se compara.

export interface CloserActivityRow {
  employee_id: string;
  employee_name: string;
  total_contacts: number;
  leads_touched: number;
  auto_contacts: number;
  manual_contacts: number;
  by_channel: Record<string, number>;
  by_result: Record<string, number>;
  last_activity: string | null;
}

export interface CloserActivityDetailRow {
  contact_id: string;
  contact_date: string;
  lead_id: string;
  lead_handle: string | null;
  channel: string | null;
  result: string | null;
  notes: string | null;
  is_auto: boolean;
}

const toParam = (d: Date) => format(d, "yyyy-MM-dd");

export function useCloserActivity(from: Date, to: Date, viewAsCloserId?: string | null) {
  const p_from = toParam(from);
  const p_to = toParam(to);
  return useQuery({
    queryKey: ["closer-activity", p_from, p_to, viewAsCloserId ?? null],
    staleTime: 30_000,
    queryFn: async (): Promise<CloserActivityRow[]> => {
      const { data, error } = await (supabase as any).rpc("get_closer_activity", { p_from, p_to });
      if (error) throw error;
      let rows = ((data ?? []) as CloserActivityRow[]).map((r) => ({
        ...r,
        by_channel: r.by_channel ?? {},
        by_result: r.by_result ?? {},
      }));
      // "Ver como" un closer → el admin ve solo a ese empleado.
      if (viewAsCloserId) rows = rows.filter((r) => r.employee_id === viewAsCloserId);
      return rows;
    },
  });
}

export function useCloserActivityDetail(from: Date, to: Date, employeeId: string | null) {
  const p_from = toParam(from);
  const p_to = toParam(to);
  return useQuery({
    queryKey: ["closer-activity-detail", p_from, p_to, employeeId],
    enabled: !!employeeId,
    staleTime: 30_000,
    queryFn: async (): Promise<CloserActivityDetailRow[]> => {
      const { data, error } = await (supabase as any).rpc("get_closer_activity_detail", {
        p_from,
        p_to,
        p_employee: employeeId,
      });
      if (error) throw error;
      return (data ?? []) as CloserActivityDetailRow[];
    },
  });
}
