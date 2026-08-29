import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { playNotificationSound } from "@/hooks/useBrowserNotifications";

export interface Notification {
  id: string;
  user_id: string | null;
  type: string;
  title: string;
  message: string | null;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
  // v2 fields
  module_origin: string | null;
  priority: string | null;
  status: string | null;
  deep_link_url: string | null;
  required_permission_module: string | null;
  required_permission_submodule: string | null;
  visibility_scope: string | null;
  role_target: string | null;
}

interface UseNotificationsOptions {
  moduleFilter?: string | null;
  priorityFilter?: string | null;
  statusFilter?: string | null;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { user } = useAuth();
  // El ID, no el objeto. `useAuth` emite un `user` nuevo por referencia en cada
  // lectura de sesion, y depender del objeto hacia que este efecto se re-corriera
  // al arrancar. Con nombre de canal fijo ("notifications-realtime") eso mataba
  // el canal: el `removeChannel` de la corrida anterior es asincrono y borra por
  // NOMBRE, asi que se llevaba puesto el canal nuevo (RealtimeClient.js:451).
  //
  // Este era el peor de los tres, y por eso nadie lo reporto: fallaba sin un
  // solo mensaje —el .subscribe() no miraba el estado— y lo tapaba a medias el
  // refetch de 60 s. Las notificaciones no dejaban de llegar: llegaban hasta un
  // minuto tarde, y eso se siente como "Maven va lento", no como un bug.
  const uid = user?.id;
  const qc = useQueryClient();
  const { canAccess } = usePermissions();
  const { isTypeEnabled } = useNotificationPreferences();
  const { settings: notifSettings } = useNotificationSettings();

  const query = useQuery({
    queryKey: ["notifications", options.moduleFilter, options.priorityFilter, options.statusFilter],
    queryFn: async (): Promise<Notification[]> => {
      let q = supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      // Apply status filter or default to non-archived
      if (options.statusFilter) {
        q = q.eq("status", options.statusFilter);
      } else {
        q = q.neq("status", "archived");
      }

      if (options.moduleFilter) {
        q = q.eq("module_origin", options.moduleFilter);
      }
      if (options.priorityFilter) {
        q = q.eq("priority", options.priorityFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    enabled: !!user,
    refetchInterval: 60000, // Fallback polling; Realtime is primary
  });

  // ─── Realtime subscription ───────────────────────────────────────
  useEffect(() => {
    if (!uid) return;

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        (payload) => {
          const n = payload.new as Notification;
          // Only add if it's for this user or role-targeted
          if (n.user_id === uid || (n.user_id === null && n.role_target)) {
            qc.invalidateQueries({ queryKey: ["notifications"] });

            // Play sound if enabled and not in DND
            if (notifSettings.sound_enabled && !notifSettings.dnd_enabled) {
              playNotificationSound();
            }
          }
        },
      )
      .subscribe((estado) => {
        if (estado !== "SUBSCRIBED") {
          console.warn("[Notificaciones] El canal esta en:", estado,
            "— van a llegar con el retraso del refetch, no al instante.");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, qc, notifSettings.sound_enabled, notifSettings.dnd_enabled]);

  // ─── Permission-filtered notifications ───────────────────────────
  const filteredNotifications = (query.data ?? []).filter((n) => {
    // Exclude orphaned notifications (no user_id and no role_target)
    if (!n.user_id && !n.role_target) return false;
    // Permission filter
    if (n.required_permission_module && !canAccess(n.required_permission_module, n.required_permission_submodule ?? undefined)) {
      return false;
    }
    // Preference filter (opt-out model)
    if (n.module_origin && n.type) {
      if (!isTypeEnabled(n.module_origin, n.type)) return false;
    }
    return true;
  });

  const unreadCount = filteredNotifications.filter((n) => n.status === "new" || (!n.status && !n.is_read)).length;

  // ─── Mutations ───────────────────────────────────────────────────
  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, status: "read" } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, status: "read" } as any)
        .in("status", ["new"]);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const archiveNotification = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ status: "archived" } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const archiveAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ status: "archived" } as any)
        .in("status", ["new", "read"]);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return {
    notifications: filteredNotifications,
    unreadCount,
    isLoading: query.isLoading,
    markAsRead,
    markAllAsRead,
    archiveNotification,
    archiveAll,
    deleteNotification,
  };
}
