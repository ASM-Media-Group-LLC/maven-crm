import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Asistencia automática de chatters (vista v_chatter_attendance, security_invoker → solo management).
// Deriva turno + check-in + puntualidad de la 1ª actividad de Hubstaff (no usa la tabla `attendance`
// formal, keyeada a employees, hoy vacío). Tabla/vista nueva → casteamos (supabase as any).
export interface ChatterAttendanceRow {
  blu_employee_id: number;
  name: string;
  period: string;
  shift_start: number;          // minutos desde medianoche del turno (0=12am, 480=8am, 960=4pm)
  turno: string | null;         // etiqueta legible del turno
  dias: number;                 // días con actividad en el período
  checkin_prom_min: number;     // check-in promedio (minutos desde medianoche, circular)
  tardanzas: number;            // días que arrancó > 10 min tarde
  pct_a_tiempo: number;         // % de días dentro de tolerancia
  min_tarde_prom: number | null;// minutos de retraso promedio en los días tarde
}

export const useChatterAttendance = (period?: string | null) =>
  useQuery({
    queryKey: ["chatter-attendance", period ?? "latest"],
    queryFn: async (): Promise<ChatterAttendanceRow[]> => {
      let q = (supabase as any).from("v_chatter_attendance").select("*");
      if (period) q = q.eq("period", period);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as ChatterAttendanceRow[];
      // Sin período fijo → el más reciente con datos.
      if (!period && rows.length) {
        const latest = rows.reduce((m, r) => (r.period > m ? r.period : m), rows[0].period);
        rows = rows.filter((r) => r.period === latest);
      }
      // Peor puntualidad primero (lo accionable arriba).
      return rows.sort((a, b) => (a.pct_a_tiempo ?? 100) - (b.pct_a_tiempo ?? 100) || b.tardanzas - a.tardanzas);
    },
    staleTime: 60_000,
  });
