import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CanalDeAviso } from "@/lib/catalogoDeEventos";

// Preferencias por evento (Ajustes → Notificaciones → Eventos).
//
// Modelo opt-out: sin fila, todo encendido. Una fila apaga o prende cada canal
// (in_app / push) de un tipo de evento. La misma regla vive en el servidor
// (notif_canal_activo, migración 20260906160000): acá se usa para lo que decide
// el cliente (el filtro de la campana, el sonido y la tarjeta dentro de Maven) y
// allá para lo que decide la base (crear la fila de la campana, mandar el push).
export interface NotificationPreference {
  id: string;
  user_id: string;
  module: string;
  notification_type: string;
  channel_in_app: boolean | null;
  channel_push: boolean | null;
  is_enabled: boolean | null;
  updated_at: string | null;
}

/** Regla pura, espejo de `notif_canal_activo` en Postgres. */
export function canalActivoEn(
  prefs: readonly Pick<NotificationPreference, "notification_type" | "channel_in_app" | "channel_push" | "is_enabled">[],
  type: string,
  canal: CanalDeAviso,
): boolean {
  const pref = prefs.find((p) => p.notification_type === type);
  if (!pref) return true;
  if (pref.is_enabled === false) return false;
  const valor = canal === "push" ? pref.channel_push : pref.channel_in_app;
  return valor !== false;
}

export function useNotificationPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async (): Promise<NotificationPreference[]> => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("id, user_id, module, notification_type, channel_in_app, channel_push, is_enabled, updated_at")
        .order("module");
      if (error) throw error;
      return (data ?? []) as NotificationPreference[];
    },
    enabled: !!user,
  });

  const prefs = useMemo(() => query.data ?? [], [query.data]);

  // Cambia UN canal de UN tipo sin pisar el otro canal: la fila se completa con
  // lo que ya había (o con "encendido", que es el default sin fila).
  const upsertPreference = useMutation({
    mutationFn: async (cambio: {
      module: string;
      notification_type: string;
      channel_in_app?: boolean;
      channel_push?: boolean;
    }) => {
      const actual = prefs.find((p) => p.notification_type === cambio.notification_type);
      const { error } = await supabase
        .from("notification_preferences")
        .upsert(
          {
            user_id: user!.id,
            module: cambio.module,
            notification_type: cambio.notification_type,
            channel_in_app: cambio.channel_in_app ?? actual?.channel_in_app ?? true,
            channel_push: cambio.channel_push ?? actual?.channel_push ?? true,
            is_enabled: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,module,notification_type" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });

  // Varios tipos de golpe (el interruptor "Todo" de un módulo).
  const upsertVarias = useMutation({
    mutationFn: async (filas: {
      module: string;
      notification_type: string;
      channel_in_app: boolean;
      channel_push: boolean;
    }[]) => {
      if (!filas.length) return;
      const ahora = new Date().toISOString();
      const { error } = await supabase
        .from("notification_preferences")
        .upsert(
          filas.map((f) => ({ user_id: user!.id, ...f, is_enabled: true, updated_at: ahora })),
          { onConflict: "user_id,module,notification_type" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });

  const isCanalActivo = useCallback(
    (type: string, canal: CanalDeAviso) => canalActivoEn(prefs, type, canal),
    [prefs],
  );

  return {
    preferences: prefs,
    isLoading: query.isLoading,
    upsertPreference,
    upsertVarias,
    isCanalActivo,
  };
}
