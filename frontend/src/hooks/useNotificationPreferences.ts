import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CANAL_ENCENDIDO_POR_DEFECTO, type CanalDeAviso } from "@/lib/catalogoDeEventos";

// Preferencias por evento (Ajustes → Notificaciones → Eventos).
//
// Modelo opt-out para in_app y push (sin fila, encendidos) y opt-in para el
// correo (sin fila, apagado). Una fila prende o apaga cada canal de un tipo. La misma regla vive en el servidor
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
  channel_email: boolean | null;
  is_enabled: boolean | null;
  updated_at: string | null;
}

type CanalesDeFila = Pick<NotificationPreference, "channel_in_app" | "channel_push" | "channel_email">;
const columnaDelCanal: Record<CanalDeAviso, keyof CanalesDeFila> = {
  in_app: "channel_in_app",
  push: "channel_push",
  email: "channel_email",
};

/** Regla pura, espejo de `notif_canal_activo` en Postgres. */
export function canalActivoEn(
  prefs: readonly (Pick<NotificationPreference, "notification_type" | "is_enabled"> & CanalesDeFila)[],
  type: string,
  canal: CanalDeAviso,
): boolean {
  const pref = prefs.find((p) => p.notification_type === type);
  if (!pref) return CANAL_ENCENDIDO_POR_DEFECTO[canal];
  if (pref.is_enabled === false) return false;
  return pref[columnaDelCanal[canal]] ?? CANAL_ENCENDIDO_POR_DEFECTO[canal];
}

export function useNotificationPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async (): Promise<NotificationPreference[]> => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("id, user_id, module, notification_type, channel_in_app, channel_push, channel_email, is_enabled, updated_at")
        .order("module");
      if (error) throw error;
      return (data ?? []) as NotificationPreference[];
    },
    enabled: !!user,
  });

  const prefs = useMemo(() => query.data ?? [], [query.data]);

  // Cambia UN canal de UN tipo sin pisar los otros: la fila se completa con lo
  // que ya había (o con el default de cada canal).
  const upsertPreference = useMutation({
    mutationFn: async (cambio: {
      module: string;
      notification_type: string;
      channel_in_app?: boolean;
      channel_push?: boolean;
      channel_email?: boolean;
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
            channel_email: cambio.channel_email ?? actual?.channel_email ?? false,
            is_enabled: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,module,notification_type" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });

  // Varios tipos de golpe (el interruptor "Todo" de un módulo). El correo no se
  // toca: conserva lo que tenía cada fila (o apagado, su default).
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
          filas.map((f) => ({
            user_id: user!.id,
            ...f,
            channel_email: prefs.find((p) => p.notification_type === f.notification_type)?.channel_email ?? false,
            is_enabled: true,
            updated_at: ahora,
          })),
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
