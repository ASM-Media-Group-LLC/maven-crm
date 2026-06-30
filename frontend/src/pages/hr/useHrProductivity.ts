import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Productividad agregada del equipo desde Hubstaff (hubstaff_daily_data) — para el
// HRDashboard. Ventana de N días (default 7). Agrega client-side: son ~350 filas/7d,
// muy por debajo del cap de 1000 de PostgREST. management-only (RLS de la tabla).

export interface HrProductivity {
  totalHours: number;
  avgActivity: number; // % promedio (ignora días con 0 actividad)
  people: number; // personas distintas trackeadas en la ventana
  days: number; // días con actividad
  byDay: { date: string; hours: number }[]; // serie para sparkline
}

export const useHrProductivity = (windowDays = 7) =>
  useQuery({
    queryKey: ["hr-productivity", windowDays],
    queryFn: async (): Promise<HrProductivity> => {
      const since = new Date();
      since.setDate(since.getDate() - windowDays);
      const sinceStr = since.toISOString().slice(0, 10);
      const { data, error } = await (supabase as any)
        .from("hubstaff_daily_data")
        .select("date, hubstaff_user_id, tracked_seconds, overall_activity")
        .gte("date", sinceStr);
      if (error) throw error;
      const rows = (data ?? []) as {
        date: string;
        hubstaff_user_id: string;
        tracked_seconds: number | null;
        overall_activity: number | null;
      }[];

      const people = new Set<string>();
      const byDayMap = new Map<string, number>();
      let totalSeconds = 0;
      let actSum = 0;
      let actCount = 0;
      for (const r of rows) {
        if (r.hubstaff_user_id) people.add(r.hubstaff_user_id);
        const secs = Number(r.tracked_seconds) || 0;
        totalSeconds += secs;
        byDayMap.set(r.date, (byDayMap.get(r.date) ?? 0) + secs);
        const act = Number(r.overall_activity) || 0;
        if (act > 0) { actSum += act; actCount += 1; }
      }
      const byDay = Array.from(byDayMap.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, secs]) => ({ date, hours: Math.round((secs / 3600) * 10) / 10 }));

      return {
        totalHours: Math.round((totalSeconds / 3600) * 10) / 10,
        avgActivity: actCount ? Math.round((actSum / actCount) * 10) / 10 : 0,
        people: people.size,
        days: byDayMap.size,
        byDay,
      };
    },
    staleTime: 60_000,
  });
