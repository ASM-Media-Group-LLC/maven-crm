import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { playNotificationSound } from "@/hooks/useBrowserNotifications";

import { useCanalQueRevive } from "./useCanalQueRevive";
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
  // El ID, no el objeto: `useAuth` emite un `user` nuevo por referencia en cada
  // lectura de sesión. Historia: el canal tenía nombre fijo y cualquier re-corrida
  // del efecto (el objeto user; después, los ajustes de sonido al cargar) lo
  // recreaba con el mismo nombre, y el removeChannel del anterior —asíncrono,
  // por NOMBRE— se llevaba puesto al nuevo (RealtimeClient.js:451). Fallaba sin
  // un solo mensaje y lo tapaba a medias el refetch de 60 s: las notificaciones
  // llegaban tarde, no dejaban de llegar, y eso se siente como "Maven va lento".
  // Hoy el canal va por useCanalQueRevive (abajo), con topic versionado.
  const uid = user?.id;
  const qc = useQueryClient();
  const { canAccess } = usePermissions();
  const { isCanalActivo } = useNotificationPreferences();
  // En ref: el handler de realtime vive en un efecto con deps fijas.
  const isCanalActivoRef = useRef(isCanalActivo);
  isCanalActivoRef.current = isCanalActivo;
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

  // ─── Realtime: un canal que revive ───────────────────────────────
  // Mismo patrón que Messenger (useCanalQueRevive): nombre versionado —sin la
  // carrera del removeChannel por nombre— y, si el socket lo deja en CLOSED,
  // CHANNEL_ERROR o TIMED_OUT, se vuelve a crear y se refresca la lista. Antes
  // el canal moría en silencio y la campana quedaba a merced del refetch de
  // 60 s, que además se pausa cuando la ventana no tiene el foco: una mención
  // aparecía "mucho rato después", al volver a esa ventana (Jhon, 16/09).
  // El detonante en su cuenta: sonido apagado. Al cargar ese ajuste el efecto
  // se re-corría y recreaba el canal con el mismo nombre; el removeChannel del
  // anterior se llevaba al nuevo. Por eso los ajustes de sonido van por ref.
  const sonidoRef = useRef({ sonar: notifSettings.sound_enabled, noMolestar: notifSettings.dnd_enabled });
  sonidoRef.current = { sonar: notifSettings.sound_enabled, noMolestar: notifSettings.dnd_enabled };
  useCanalQueRevive({
    topic: uid ? `notifications-${uid}` : null,
    armar: (canal) =>
      canal.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const n = payload.new as Notification;
          // Solo las mías o las dirigidas a mi rol.
          if (n.user_id === uid || (n.user_id === null && n.role_target)) {
            void qc.invalidateQueries({ queryKey: ["notifications"] });

            // Ajustes → Eventos → "En Maven" apagado para este tipo: la fila se
            // guarda igual (de ella salen el push y el correo), pero acá ni se
            // muestra ni suena.
            if (n.type && !isCanalActivoRef.current(n.type, "in_app")) return;
            if (sonidoRef.current.sonar && !sonidoRef.current.noMolestar) playNotificationSound();
          }
        },
      ),
    // Al revivir, traer lo que llegó mientras el canal estuvo muerto.
    alRevivir: () => { void qc.invalidateQueries({ queryKey: ["notifications"] }); },
  });

  // ─── Permission-filtered notifications ───────────────────────────
  const filteredNotifications = (query.data ?? []).filter((n) => {
    // Exclude orphaned notifications (no user_id and no role_target)
    if (!n.user_id && !n.role_target) return false;
    // Permission filter
    if (n.required_permission_module && !canAccess(n.required_permission_module, n.required_permission_submodule ?? undefined)) {
      return false;
    }
    // Preferencia por tipo (opt-out). El servidor ya no crea la fila cuando el
    // in-app de ese tipo está apagado; esto tapa las que quedaron de antes.
    if (n.type && !isCanalActivo(n.type, "in_app")) return false;
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
