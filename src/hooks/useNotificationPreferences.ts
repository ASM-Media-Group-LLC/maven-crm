import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface NotificationPreference {
  id: string;
  user_id: string;
  module: string;
  notification_type: string;
  channel_in_app: boolean;
  channel_email: boolean;
  is_enabled: boolean;
}

export function useNotificationPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async (): Promise<NotificationPreference[]> => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .order("module");
      if (error) throw error;
      return (data ?? []) as NotificationPreference[];
    },
    enabled: !!user,
  });

  const upsertPreference = useMutation({
    mutationFn: async (pref: {
      module: string;
      notification_type: string;
      channel_in_app?: boolean;
      channel_email?: boolean;
      is_enabled?: boolean;
    }) => {
      const { error } = await supabase
        .from("notification_preferences")
        .upsert(
          {
            user_id: user!.id,
            module: pref.module,
            notification_type: pref.notification_type,
            channel_in_app: pref.channel_in_app ?? true,
            channel_email: pref.channel_email ?? false,
            is_enabled: pref.is_enabled ?? true,
          } as any,
          { onConflict: "user_id,module,notification_type" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });

  const toggleModule = useMutation({
    mutationFn: async ({ module, enabled }: { module: string; enabled: boolean }) => {
      // Get all types for this module from existing preferences
      const existing = (query.data ?? []).filter((p) => p.module === module);
      if (existing.length > 0) {
        const { error } = await supabase
          .from("notification_preferences")
          .update({ is_enabled: enabled } as any)
          .eq("module", module);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });

  // Helper: check if a notification type is enabled (opt-out model: enabled by default)
  const isTypeEnabled = (module: string, notificationType: string): boolean => {
    const pref = (query.data ?? []).find(
      (p) => p.module === module && p.notification_type === notificationType
    );
    if (!pref) return true; // Default: enabled
    return pref.is_enabled && pref.channel_in_app;
  };

  const isModuleEnabled = (module: string): boolean => {
    const prefs = (query.data ?? []).filter((p) => p.module === module);
    if (prefs.length === 0) return true; // Default: enabled
    return prefs.some((p) => p.is_enabled);
  };

  return {
    preferences: query.data ?? [],
    isLoading: query.isLoading,
    upsertPreference,
    toggleModule,
    isTypeEnabled,
    isModuleEnabled,
  };
}
