import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Hooks GENÉRICOS de Hubstaff por ROL QA (Chatter/closer/manager/LLG). Estandarizan Asistencia
// y Anomalías en los 4 QA: misma vista, filtrada por rol. management-only (RLS de las vistas).
// Vistas nuevas → casteo (supabase as any).

export type QaRole = "Chatter" | "closer" | "manager" | "LLG";

// ── Asistencia ──
export interface QaAttendanceRow {
  hubstaff_user_id: string;
  name: string;
  role: QaRole;
  period: string;
  shift_start: number;
  turno: string | null;
  dias: number;
  checkin_prom_min: number;
  tardanzas: number;
  pct_a_tiempo: number;
  min_tarde_prom: number | null;
}

export const useQaAttendance = (role: QaRole, period?: string | null) =>
  useQuery({
    queryKey: ["qa-attendance", role, period ?? "latest"],
    queryFn: async (): Promise<QaAttendanceRow[]> => {
      let q = (supabase as any).from("v_qa_attendance").select("*").eq("role", role);
      if (period) q = q.eq("period", period);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as QaAttendanceRow[];
      if (!period && rows.length) {
        const latest = rows.reduce((m, r) => (r.period > m ? r.period : m), rows[0].period);
        rows = rows.filter((r) => r.period === latest);
      }
      return rows.sort((a, b) => (a.pct_a_tiempo ?? 100) - (b.pct_a_tiempo ?? 100) || b.tardanzas - a.tardanzas);
    },
    staleTime: 60_000,
  });

// ── Anomalías ──
export type AnomalyTipo = "baja_actividad" | "dia_corto" | "dia_largo";

export interface QaAnomalyRow {
  hubstaff_user_id: string;
  name: string;
  role: QaRole;
  period: string;
  date: string;
  hours: number;
  act: number;
  tipo: AnomalyTipo;
}

export const useQaAnomalies = (role: QaRole, period?: string | null) =>
  useQuery({
    queryKey: ["qa-anomalies", role, period ?? "latest"],
    queryFn: async (): Promise<QaAnomalyRow[]> => {
      let q = (supabase as any).from("v_qa_anomalies").select("*").eq("role", role);
      if (period) q = q.eq("period", period);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as QaAnomalyRow[];
      if (!period && rows.length) {
        const latest = rows.reduce((m, r) => (r.period > m ? r.period : m), rows[0].period);
        rows = rows.filter((r) => r.period === latest);
      }
      return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name)));
    },
    staleTime: 60_000,
  });
