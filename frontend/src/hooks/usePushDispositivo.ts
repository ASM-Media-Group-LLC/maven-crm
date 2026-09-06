import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useInstalarMaven } from "@/hooks/useInstalarMaven";
import {
  type EstadoPush,
  desuscribirEsteDispositivo,
  estadoPushActual,
  marcarPushEnEsteDispositivo,
  suscribirEsteDispositivo,
} from "@/lib/pushDispositivo";
import type { Plataforma } from "@/lib/plataformaPwa";

/** El botón "Activar en este dispositivo": permiso + suscripción + opt-in. */
export function usePushDispositivo(): {
  estado: EstadoPush;
  ocupado: boolean;
  plataforma: Plataforma;
  instalada: boolean;
  activar(): Promise<boolean>;
  desactivar(): Promise<void>;
} {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { settings, updateSettings } = useNotificationSettings();
  const { plataforma, instalada } = useInstalarMaven();
  const [ocupado, setOcupado] = useState(false);
  // Sube tras activar/desactivar para recalcular el estado (permiso y bandera
  // viven fuera de React).
  const [version, setVersion] = useState(0);

  const userId = user?.id ?? null;
  const optIn = settings.push_enabled === true;
  const estado = useMemo(
    () => estadoPushActual({ userId, plataforma, instalada, optIn }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, plataforma, instalada, optIn, version],
  );

  const activar = useCallback(async (): Promise<boolean> => {
    if (!userId || estado === "necesita-instalar" || estado === "no-soportado") return false;
    setOcupado(true);
    try {
      // PRIMERA instrucción asíncrona, sin ningún await antes: Safari solo
      // acepta pedir el permiso dentro del gesto del usuario, y un fetch previo
      // lo pierde.
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        toast.error(t("push.dispositivo.bloqueadas"));
        return false;
      }
      await suscribirEsteDispositivo();
      await updateSettings.mutateAsync({ push_enabled: true });
      marcarPushEnEsteDispositivo(userId, true);
      toast.success(t("push.dispositivo.exito"));
      return true;
    } catch {
      toast.error(t("push.dispositivo.error"));
      return false;
    } finally {
      setOcupado(false);
      setVersion((v) => v + 1);
    }
  }, [userId, estado, updateSettings, t]);

  const desactivar = useCallback(async (): Promise<void> => {
    if (!userId) return;
    setOcupado(true);
    try {
      await desuscribirEsteDispositivo();
      await updateSettings.mutateAsync({ push_enabled: false });
      marcarPushEnEsteDispositivo(userId, false);
      toast.success(t("push.dispositivo.desactivadas"));
    } catch {
      toast.error(t("push.dispositivo.error"));
    } finally {
      setOcupado(false);
      setVersion((v) => v + 1);
    }
  }, [userId, updateSettings, t]);

  return { estado, ocupado, plataforma, instalada, activar, desactivar };
}
