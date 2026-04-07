import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, subDays, startOfWeek, startOfMonth, format } from "date-fns";

export interface ActivityDataPoint {
  label: string;
  mouse: number;
  keyboard: number;
}

export interface Screenshot {
  id: string;
  timestamp: string;
  activity: number;
  url: string | null;
  captured_at: string;
}

export interface TimelineEvent {
  time: string;
  type: "start" | "high" | "medium" | "low" | "break" | "end";
  label: string;
}

export function useHubstaffAgentDetail(memberId: string, period: "daily" | "weekly" | "monthly") {
  const activitiesQuery = useQuery({
    queryKey: ["hubstaff-agent-activities", memberId, period],
    enabled: !!memberId,
    queryFn: async () => {
      const now = new Date();
      let since: Date;
      if (period === "daily") since = startOfDay(now);
      else if (period === "weekly") since = startOfWeek(now, { weekStartsOn: 1 });
      else since = startOfMonth(now);

      const { data, error } = await supabase
        .from("hubstaff_activities")
        .select("*")
        .eq("member_id", memberId)
        .gte("starts_at", since.toISOString())
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const screenshotsQuery = useQuery({
    queryKey: ["hubstaff-agent-screenshots", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const todayStart = startOfDay(new Date());
      const { data, error } = await supabase
        .from("hubstaff_screenshots")
        .select("*")
        .eq("member_id", memberId)
        .gte("captured_at", todayStart.toISOString())
        .order("captured_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((s, i) => ({
        id: s.id,
        timestamp: format(new Date(s.captured_at), "h:mm a"),
        activity: s.activity_percent ?? 0,
        url: s.screenshot_url,
        captured_at: s.captured_at,
      })) as Screenshot[];
    },
  });

  // Build chart data from activities
  const chartData: ActivityDataPoint[] = (() => {
    const acts = activitiesQuery.data ?? [];
    if (acts.length === 0) return [];

    if (period === "daily") {
      // Group by hour
      const byHour = new Map<number, { mouse: number[]; keyboard: number[] }>();
      acts.forEach(a => {
        const h = new Date(a.starts_at).getHours();
        const entry = byHour.get(h) ?? { mouse: [], keyboard: [] };
        entry.mouse.push(a.mouse_activity ?? 0);
        entry.keyboard.push(a.keyboard_activity ?? 0);
        byHour.set(h, entry);
      });
      return Array.from(byHour.entries())
        .sort(([a], [b]) => a - b)
        .map(([h, v]) => ({
          label: `${h}:00`,
          mouse: Math.round(v.mouse.reduce((s, x) => s + x, 0) / v.mouse.length),
          keyboard: Math.round(v.keyboard.reduce((s, x) => s + x, 0) / v.keyboard.length),
        }));
    }

    if (period === "weekly") {
      const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
      const byDay = new Map<number, { mouse: number[]; keyboard: number[] }>();
      acts.forEach(a => {
        const dow = new Date(a.starts_at).getDay();
        const entry = byDay.get(dow) ?? { mouse: [], keyboard: [] };
        entry.mouse.push(a.mouse_activity ?? 0);
        entry.keyboard.push(a.keyboard_activity ?? 0);
        byDay.set(dow, entry);
      });
      return [1, 2, 3, 4, 5, 6, 0]
        .filter(d => byDay.has(d))
        .map(d => {
          const v = byDay.get(d)!;
          return {
            label: dayNames[d],
            mouse: Math.round(v.mouse.reduce((s, x) => s + x, 0) / v.mouse.length),
            keyboard: Math.round(v.keyboard.reduce((s, x) => s + x, 0) / v.keyboard.length),
          };
        });
    }

    // monthly - group by day of month
    const byDate = new Map<number, { mouse: number[]; keyboard: number[] }>();
    acts.forEach(a => {
      const d = new Date(a.starts_at).getDate();
      const entry = byDate.get(d) ?? { mouse: [], keyboard: [] };
      entry.mouse.push(a.mouse_activity ?? 0);
      entry.keyboard.push(a.keyboard_activity ?? 0);
      byDate.set(d, entry);
    });
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a - b)
      .map(([d, v]) => ({
        label: `${d}`,
        mouse: Math.round(v.mouse.reduce((s, x) => s + x, 0) / v.mouse.length),
        keyboard: Math.round(v.keyboard.reduce((s, x) => s + x, 0) / v.keyboard.length),
      }));
  })();

  // Build timeline from today's activities
  const timeline: TimelineEvent[] = (() => {
    const acts = activitiesQuery.data ?? [];
    if (acts.length === 0) return [];
    const todayActs = acts.filter(a => {
      const d = new Date(a.starts_at);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    });
    if (todayActs.length === 0) return [];

    const events: TimelineEvent[] = [];
    const first = new Date(todayActs[0].starts_at);
    events.push({ time: format(first, "h:mm a"), type: "start", label: "Inicio de jornada" });

    // Group consecutive intervals by activity level
    let currentType: TimelineEvent["type"] | null = null;
    let segStart = first;

    todayActs.forEach((a, i) => {
      const overall = a.overall_activity ?? 0;
      const type: TimelineEvent["type"] = overall > 60 ? "high" : overall > 30 ? "medium" : overall > 0 ? "low" : "break";
      if (type !== currentType && currentType !== null) {
        const segEnd = new Date(a.starts_at);
        events.push({
          time: `${format(segStart, "h:mm a")} - ${format(segEnd, "h:mm a")}`,
          type: currentType,
          label: currentType === "high" ? "Alta actividad" : currentType === "medium" ? "Actividad moderada" : currentType === "low" ? "Baja actividad" : "Pausa",
        });
        segStart = segEnd;
      }
      currentType = type;
      if (i === todayActs.length - 1) {
        const segEnd = new Date(new Date(a.starts_at).getTime() + (a.tracked_seconds ?? 0) * 1000);
        events.push({
          time: `${format(segStart, "h:mm a")} - ${format(segEnd, "h:mm a")}`,
          type: currentType!,
          label: currentType === "high" ? "Alta actividad" : currentType === "medium" ? "Actividad moderada" : currentType === "low" ? "Baja actividad" : "Pausa",
        });
        events.push({ time: format(segEnd, "h:mm a"), type: "end", label: "Última actividad registrada" });
      }
    });

    return events;
  })();

  // KPIs
  const acts = activitiesQuery.data ?? [];
  const totalSeconds = acts.reduce((s, a) => s + (a.tracked_seconds ?? 0), 0);
  const avgMouse = acts.length > 0 ? Math.round(acts.reduce((s, a) => s + (a.mouse_activity ?? 0), 0) / acts.length) : 0;
  const avgKeyboard = acts.length > 0 ? Math.round(acts.reduce((s, a) => s + (a.keyboard_activity ?? 0), 0) / acts.length) : 0;
  const productivity = Math.round((avgMouse + avgKeyboard) / 2);

  return {
    chartData,
    screenshots: screenshotsQuery.data ?? [],
    timeline,
    kpis: {
      hours: `${(totalSeconds / 3600).toFixed(1)}h`,
      productivity: `${productivity}%`,
      mouse: `${avgMouse}%`,
      keyboard: `${avgKeyboard}%`,
    },
    isLoading: activitiesQuery.isLoading,
    isEmpty: !activitiesQuery.isLoading && acts.length === 0,
  };
}
