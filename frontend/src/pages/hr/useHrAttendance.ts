import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Asistencia auto para RRHH: misma vista v_qa_attendance que usa el QA por rol,
// pero SIN filtrar por rol — RRHH ve a TODO el personal trackeado en Hubstaff con
// su columna de rol. Toma el período (date) más reciente. management-only (RLS).
// Vista nueva → casteo (supabase as any).

export interface HrAttendanceRow {
  hubstaff_user_id: string;
  name: string;
  role: string;
  period: string;
  shift_start: number;
  turno: string | null;
  dias: number;
  checkin_prom_min: number;
  tardanzas: number;
  pct_a_tiempo: number;
  min_tarde_prom: number | null;
  horario_cargado: boolean;
}

export const useHrAttendance = (period?: string | null) =>
  useQuery({
    queryKey: ["hr-attendance", period ?? "latest"],
    queryFn: async (): Promise<HrAttendanceRow[]> => {
      let q = (supabase as any).from("v_qa_attendance").select("*");
      if (period) q = q.eq("period", period);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as HrAttendanceRow[];
      if (!period && rows.length) {
        const latest = rows.reduce((m, r) => (r.period > m ? r.period : m), rows[0].period);
        rows = rows.filter((r) => r.period === latest);
      }
      // Peor puntualidad primero, desempate por más tardanzas.
      return rows.sort(
        (a, b) => (a.pct_a_tiempo ?? 100) - (b.pct_a_tiempo ?? 100) || (b.tardanzas ?? 0) - (a.tardanzas ?? 0),
      );
    },
    staleTime: 60_000,
  });

export const HR_ROLE_LABEL: Record<string, string> = {
  Chatter: "Chatter",
  closer: "Closer",
  manager: "Manager",
  LLG: "LLG",
  admin: "Admin",
  owner: "Owner",
  "Team Leader": "Team Leader",
  "Chatter Supervisor": "Supervisor",
};
