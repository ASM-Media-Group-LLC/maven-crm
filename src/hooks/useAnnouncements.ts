import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useCallback } from "react";

export interface Announcement {
  id: string;
  title: string;
  message: string | null;
  content_html: string | null;
  announcement_type: string;
  priority: string;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
  image_url: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  visibility: string;
  delivery_channels: string[];
  status: string;
  created_by: string | null;
  view_count: number;
  open_count: number;
}

export interface UpcomingBirthday {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  daysUntil: number;
  isToday: boolean;
}

// Fetch active announcements with audience filtering
export const useAnnouncements = () =>
  useQuery({
    queryKey: ["internal-announcements"],
    queryFn: async () => {
      const now = new Date().toISOString();

      // Get current user info for audience filtering
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Get user's employee profile for department filtering
      const { data: profile } = await (supabase
        .from("employees")
        .select("id, department_id") as any)
        .eq("profile_id", user.id)
        .maybeSingle();

      // Get user's roles
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roleNames = (userRoles ?? []).map((r) => r.role);

      // Fetch active announcements
      const { data, error } = await supabase
        .from("internal_announcements")
        .select("id, title, message, content_html, announcement_type, priority, starts_at, expires_at, created_at, image_url, attachment_url, attachment_name, visibility, delivery_channels, status, created_by, view_count, open_count")
        .eq("is_active", true)
        .lte("starts_at", now)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;

      // Filter expired
      const active = (data ?? []).filter(
        (a) => !a.expires_at || new Date(a.expires_at) > new Date()
      );

      // Get audience targets for these announcements
      const ids = active.map((a) => a.id);
      if (ids.length === 0) return [] as Announcement[];

      const { data: audienceData } = await supabase
        .from("announcement_audience")
        .select("announcement_id, target_type, target_id")
        .in("announcement_id", ids);

      const audienceMap: Record<string, Array<{ target_type: string; target_id: string | null }>> = {};
      (audienceData ?? []).forEach((a) => {
        if (!audienceMap[a.announcement_id]) audienceMap[a.announcement_id] = [];
        audienceMap[a.announcement_id].push(a);
      });

      // Filter by audience
      return active.filter((ann) => {
        if (ann.visibility === "global") return true;
        const targets = audienceMap[ann.id];
        if (!targets || targets.length === 0) return true; // No audience = global
        return targets.some((t) => {
          if (t.target_type === "all") return true;
          if (t.target_type === "department" && profile?.department_id === t.target_id) return true;
          if (t.target_type === "role" && roleNames.includes(t.target_id as any)) return true;
          if (t.target_type === "user" && user.id === t.target_id) return true;
          return false;
        });
      }) as Announcement[];
    },
    staleTime: 5 * 60 * 1000,
  });

// Separate announcements by delivery channel
export const useAnnouncementsByChannel = () => {
  const { data: announcements = [], ...rest } = useAnnouncements();

  const feed = announcements.filter(
    (a) => !a.delivery_channels || a.delivery_channels.length === 0 || a.delivery_channels.includes("feed")
  );
  const banners = announcements.filter(
    (a) => a.delivery_channels?.includes("banner")
  );
  const popups = announcements.filter(
    (a) => a.delivery_channels?.includes("popup")
  );

  return { feed, banners, popups, all: announcements, ...rest };
};

// Record a view for an announcement (upsert)
export const useRecordAnnouncementView = () => {
  const recorded = useRef<Set<string>>(new Set());

  return useCallback(async (announcementId: string) => {
    if (recorded.current.has(announcementId)) return;
    recorded.current.add(announcementId);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Upsert view
    await supabase
      .from("announcement_views")
      .upsert(
        { announcement_id: announcementId, user_id: user.id, viewed_at: new Date().toISOString() },
        { onConflict: "announcement_id,user_id" }
      );

    // Increment view_count
    const { data: ann } = await supabase
      .from("internal_announcements")
      .select("view_count")
      .eq("id", announcementId)
      .single();
    if (ann) {
      await supabase
        .from("internal_announcements")
        .update({ view_count: (ann.view_count ?? 0) + 1 })
        .eq("id", announcementId);
    }
  }, []);
};

// Record an open for an announcement
export const useRecordAnnouncementOpen = () => {
  const recorded = useRef<Set<string>>(new Set());

  return useCallback(async (announcementId: string) => {
    if (recorded.current.has(announcementId)) return;
    recorded.current.add(announcementId);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("announcement_views")
      .upsert(
        { announcement_id: announcementId, user_id: user.id, viewed_at: new Date().toISOString(), opened_at: new Date().toISOString() },
        { onConflict: "announcement_id,user_id" }
      );

    const { data: ann } = await supabase
      .from("internal_announcements")
      .select("open_count")
      .eq("id", announcementId)
      .single();
    if (ann) {
      await supabase
        .from("internal_announcements")
        .update({ open_count: (ann.open_count ?? 0) + 1 })
        .eq("id", announcementId);
    }
  }, []);
};

// Check which announcements the user has already viewed (for popup dedup)
export const useViewedAnnouncements = (announcementIds: string[]) =>
  useQuery({
    queryKey: ["viewed-announcements", announcementIds],
    queryFn: async () => {
      if (announcementIds.length === 0) return new Set<string>();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Set<string>();

      const { data } = await supabase
        .from("announcement_views")
        .select("announcement_id")
        .eq("user_id", user.id)
        .in("announcement_id", announcementIds);

      return new Set((data ?? []).map((v) => v.announcement_id));
    },
    enabled: announcementIds.length > 0,
    staleTime: 60 * 1000,
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
