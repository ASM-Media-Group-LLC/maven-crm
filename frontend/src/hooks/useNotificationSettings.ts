import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface NotificationSettings {
  id: string;
  user_id: string;
  notifications_enabled: boolean;
  realtime_enabled: boolean;
  group_similar: boolean;
  auto_mark_read_on_open: boolean;
  sound_enabled: boolean;
  show_critical_banners: boolean;
  dnd_enabled: boolean;
  dnd_start_time: string | null;
  dnd_end_time: string | null;
  dnd_allow_critical: boolean;
  digest_enabled: boolean;
  digest_frequency: string;
  digest_time: string;
  digest_channel: string;
}

const DEFAULTS: Omit<NotificationSettings, "id" | "user_id"> = {
  notifications_enabled: true,
  realtime_enabled: true,
  group_similar: false,
  auto_mark_read_on_open: false,
  sound_enabled: true,
  show_critical_banners: true,
  dnd_enabled: false,
  dnd_start_time: null,
  dnd_end_time: null,
  dnd_allow_critical: true,
  digest_enabled: false,
  digest_frequency: "daily",
  digest_time: "09:00",
  digest_channel: "in_app",
};

export function useNotificationSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["notification-settings", user?.id];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<NotificationSettings> => {
      const { data, error } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as unknown as NotificationSettings;
      return { id: "", user_id: user!.id, ...DEFAULTS };
    },
    enabled: !!user,
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<Omit<NotificationSettings, "id" | "user_id">>) => {
      const { error } = await supabase
        .from("notification_settings")
        .upsert(
          { user_id: user!.id, ...updates } as any,
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const settings = query.data ?? { id: "", user_id: user?.id ?? "", ...DEFAULTS };

  return { settings, isLoading: query.isLoading, updateSettings };
}
