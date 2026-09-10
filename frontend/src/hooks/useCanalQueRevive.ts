import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useReanudarAlVolver } from "@/hooks/useReanudarAlVolver";

/**
 * Un canal de realtime que se vuelve a levantar solo cuando se muere.
 *
 * Existe por la auditoría de Messenger del 10/09: ocho suscripciones hacían
 * `.subscribe()` sin callback de estado. En realtime-js `CLOSED` es TERMINAL —
 * el rejoin automático cubre `errored`, no `closed` — y es justo el estado en
 * que queda un canal cuando el socket se cae (el teléfono en segundo plano, o
 * los cortes de un minuto que vimos en los logs de Grace). Resultado: sin
 * sonido de aviso, contador de no leídos congelado, reacciones y menciones que
 * no llegan, fijados y archivados sin sincronizar… hasta recargar la página.
 *
 * `useChat` ya sabía revivir el suyo. Esto es ese mismo patrón, extraído:
 * - nombre de canal VERSIONADO: tras un CLOSED, pedir el mismo topic devuelve
 *   el zombi (removeChannel solo lo saca de la lista si unsubscribe contestó
 *   'ok') y subscribe() sobre él no hace nada (#1603);
 * - espera creciente entre intentos, con tope;
 * - guarda contra el CLOSED que dispara nuestro propio removeChannel del cleanup;
 * - y al volver del segundo plano / recuperar red, canal nuevo.
 *
 * ⚠️ No sirve para PRESENCIA (useOnlinePresence): ahí el topic tiene que ser el
 * mismo para todos, y versionarlo dejaría a cada persona en una sala distinta.
 */

export const TOPE_ESPERA_RECONEXION_MS = 15_000;

/** Espera antes del intento n (0 = primero): 1, 2, 4, 8, 15, 15… segundos. */
export function esperaDeReconexion(intento: number): number {
  return Math.min(1_000 * 2 ** intento, TOPE_ESPERA_RECONEXION_MS);
}

/** Con cualquiera de estos el canal se da por muerto y se vuelve a crear. */
export const ESTADOS_MUERTOS: ReadonlySet<string> = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);

type Opciones = {
  /** Nombre base del canal. `null` = no suscribir todavía (sin usuario, sin chat). */
  topic: string | null;
  /** Le cuelga los `.on(...)` al canal recién creado. Se llama en cada (re)suscripción. */
  armar: (canal: RealtimeChannel) => RealtimeChannel;
  /** Al volver a SUBSCRIBED DESPUÉS de una caída: momento de traer lo que se
   *  perdió mientras el canal estuvo muerto. No se llama en la primera conexión. */
  alRevivir?: () => void;
};

export function useCanalQueRevive({ topic, armar, alRevivir }: Opciones): void {
  const [version, setVersion] = useState(0);
  const intentoRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const huboCaidaRef = useRef(false);
  // Por ref: cambian de identidad en cada render y no queremos re-suscribir por eso.
  const armarRef = useRef(armar);
  armarRef.current = armar;
  const alRevivirRef = useRef(alRevivir);
  alRevivirRef.current = alRevivir;

  useReanudarAlVolver(() => {
    huboCaidaRef.current = true;
    setVersion((v) => v + 1);
  });

  useEffect(() => {
    if (!topic) return;
    let cancelado = false;
    const canal = armarRef.current(supabase.channel(`${topic}::v${version}`));

    canal.subscribe((status) => {
      if (cancelado) return;
      if (status === "SUBSCRIBED") {
        intentoRef.current = 0;
        if (huboCaidaRef.current) {
          huboCaidaRef.current = false;
          alRevivirRef.current?.();
        }
        return;
      }
      if (ESTADOS_MUERTOS.has(status) && !timerRef.current) {
        huboCaidaRef.current = true;
        const espera = esperaDeReconexion(intentoRef.current++);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setVersion((v) => v + 1);
        }, espera);
      }
    });

    return () => {
      // Nuestro propio removeChannel dispara CLOSED: sin `cancelado` programaría
      // un reconnect zombi del canal que acabamos de cerrar a propósito.
      cancelado = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void supabase.removeChannel(canal);
    };
  }, [topic, version]);
}
