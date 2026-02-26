import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Announcement {
  id: string;
  title: string;
  message: string | null;
  announcement_type: string;
  priority: string;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
}

export interface UpcomingBirthday {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  daysUntil: number;
  isToday: boolean;
}

export const useAnnouncements = () =>
  useQuery({
    queryKey: ["internal-announcements"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("internal_announcements")
        .select("id, title, message, announcement_type, priority, starts_at, expires_at, created_at")
        .eq("is_active", true)
        .lte("starts_at", now)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      // Filter out expired ones client-side since or-null logic is tricky
      return (data ?? []).filter(
        (a) => !a.expires_at || new Date(a.expires_at) > new Date()
      ) as Announcement[];
    },
    staleTime: 5 * 60 * 1000,
  });

export const useUpcomingBirthdays = () =>
  useQuery({
    queryKey: ["upcoming-birthdays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, birth_date")
        .eq("status", "activo")
        .not("birth_date", "is", null);
      if (error) throw error;

      const today = new Date();
      const todayMonth = today.getMonth();
      const todayDay = today.getDate();

      const withDays: UpcomingBirthday[] = (data ?? [])
        .map((e) => {
          const bd = new Date(e.birth_date + "T12:00:00");
          const bdMonth = bd.getMonth();
          const bdDay = bd.getDate();

          let daysUntil: number;
          const thisYearBd = new Date(today.getFullYear(), bdMonth, bdDay);
          if (thisYearBd.getTime() < today.setHours(0, 0, 0, 0)) {
            // Already passed this year
            const nextYearBd = new Date(today.getFullYear() + 1, bdMonth, bdDay);
            daysUntil = Math.ceil((nextYearBd.getTime() - Date.now()) / 86400000);
          } else {
            daysUntil = Math.ceil((thisYearBd.getTime() - Date.now()) / 86400000);
          }

          const isToday = bdMonth === todayMonth && bdDay === todayDay;

          return {
            id: e.id,
            first_name: e.first_name,
            last_name: e.last_name,
            birth_date: e.birth_date!,
            daysUntil: isToday ? 0 : daysUntil,
            isToday,
          };
        })
        .filter((b) => b.daysUntil <= 7)
        .sort((a, b) => a.daysUntil - b.daysUntil);

      return withDays;
    },
    staleTime: 10 * 60 * 1000,
  });
