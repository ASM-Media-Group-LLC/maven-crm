import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, format, parseISO } from "date-fns";

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function getMonday() {
  const now = new Date();
  const s = startOfWeek(now, { weekStartsOn: 1 });
  return s;
}

function dayIndex(dateStr: string) {
  const d = parseISO(dateStr);
  const day = d.getDay(); // 0=Sun
  return day === 0 ? 6 : day - 1; // 0=Mon..6=Sun
}

export const useWeeklyStats = () =>
  useQuery({
    queryKey: ["dashboard-weekly"],
    queryFn: async () => {
      const monday = getMonday();
      const iso = monday.toISOString();

      const [{ data: leads }, { data: deals }] = await Promise.all([
        supabase.from("leads").select("created_at").gte("created_at", iso),
        supabase.from("deals").select("created_at").gte("created_at", iso),
      ]);

      const result = DAY_LABELS.map((day) => ({ day, leads: 0, deals: 0 }));

      for (const l of leads ?? []) {
        const i = dayIndex(l.created_at);
        if (i >= 0 && i < 7) result[i].leads++;
      }
      for (const d of deals ?? []) {
        const i = dayIndex(d.created_at);
        if (i >= 0 && i < 7) result[i].deals++;
      }

      return result;
    },
    staleTime: 2 * 60 * 1000,
  });

export const useOperationalKPIs = () =>
  useQuery({
    queryKey: ["dashboard-operational-kpis"],
    queryFn: async () => {
      // Dos tarjetas de KPI del tablero → count:"estimated" (exacto por
      // debajo del max-rows de PostgREST, que es donde viven estos números).
      const employeesRes = await (supabase.from("employees_directory").select("id", { count: "estimated", head: true }) as any).eq("status", "activo");
      const absencesRes = await (supabase.from("absences").select("id", { count: "estimated", head: true }) as any).eq("status", "approved");

      return {
        totalEmployees: employeesRes.count ?? 0,
        absencesToday: absencesRes.count ?? 0,
      };
    },
    staleTime: 2 * 60 * 1000,
  });

export interface ActivityItem {
  id: string;
  type: "ticket";
  title: string;
  date: string;
  status?: string;
}

export const useRecentActivity = () =>
  useQuery({
    queryKey: ["dashboard-recent-activity"],
    queryFn: async () => {
      const { data: tickets } = await supabase.from("tickets").select("id, title, status, created_at").order("created_at", { ascending: false }).limit(8);

      const items: ActivityItem[] = (tickets ?? []).map((t) => ({ id: t.id, type: "ticket" as const, title: t.title, date: t.created_at, status: t.status }));

      return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
    },
    staleTime: 2 * 60 * 1000,
  });
