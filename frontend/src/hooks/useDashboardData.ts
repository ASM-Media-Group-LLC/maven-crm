import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

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
      const today = new Date().toISOString().slice(0, 10);

      const employeesRes = await (supabase.from("employees_directory").select("id", { count: "exact", head: true }) as any).eq("status", "activo");
      const absencesRes = await (supabase.from("absences").select("id", { count: "exact", head: true }) as any).eq("status", "approved");
      const overdueRes = await (supabase.from("tasks").select("id", { count: "exact", head: true }) as any).neq("status", "done");
      const eventsRes = await (supabase.from("events").select("id", { count: "exact", head: true }) as any).eq("date", today);

      return {
        totalEmployees: employeesRes.count ?? 0,
        absencesToday: absencesRes.count ?? 0,
        overdueTasks: overdueRes.count ?? 0,
        eventsToday: eventsRes.count ?? 0,
      };
    },
    staleTime: 2 * 60 * 1000,
  });

export interface ActivityItem {
  id: string;
  type: "ticket" | "task" | "event";
  title: string;
  date: string;
  status?: string;
}

export const useRecentActivity = () =>
  useQuery({
    queryKey: ["dashboard-recent-activity"],
    queryFn: async () => {
      const [{ data: tickets }, { data: tasks }, { data: events }] = await Promise.all([
        supabase.from("tickets").select("id, title, status, created_at").order("created_at", { ascending: false }).limit(5),
        supabase.from("tasks").select("id, title, status, updated_at").order("updated_at", { ascending: false }).limit(5),
        supabase.from("events").select("id, name, status, created_at").order("created_at", { ascending: false }).limit(5),
      ]);

      const items: ActivityItem[] = [
        ...(tickets ?? []).map((t) => ({ id: t.id, type: "ticket" as const, title: t.title, date: t.created_at, status: t.status })),
        ...(tasks ?? []).map((t) => ({ id: t.id, type: "task" as const, title: t.title, date: t.updated_at, status: t.status })),
        ...(events ?? []).map((e) => ({ id: e.id, type: "event" as const, title: e.name, date: e.created_at, status: e.status })),
      ];

      return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
    },
    staleTime: 2 * 60 * 1000,
  });

export const usePendingTasks = () =>
  useQuery({
    queryKey: ["dashboard-pending-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, due_at, priority")
        .neq("status", "done")
        .order("due_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });
