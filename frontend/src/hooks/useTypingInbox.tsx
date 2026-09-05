import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Tecleo del Messenger: de acá sale TODO el "está escribiendo".
 *
 * Antes había un canal de PRESENCIA por conversación (`typing-<conversationId>`)
 * y fue el origen de cuatro incidentes seguidos (#1603, #1605, #1611, #1613);
 * aun arreglado seguía llegando tarde o no llegando, así que se borró. Hoy hay
 * dos topics y los dos van por broadcast:
 *
 *   · `typing-conv-<convId>`  → lo escucha quien tiene la conversación ABIERTA
 *     (cabecera del chat y ventanita del muelle). UN aviso llega a todos los
 *     miembros, así que cubre grupos. Ese canal vive en useChat/useMessages.
 *   · `typing-inbox-<userId>` → el buzón de cada persona, que alimenta la LISTA
 *     (sidebar y nubecita). Solo DMs. Ese vive acá.
 *
 * Uno por PERSONA y uno por conversación ABIERTA — nunca uno por cada
 * conversación de la lista (media 9, máximo 49, por 70 personas): eso último es
 * exactamente el patrón que hizo que Supabase cortara el socket en #1605.
 *
 * Lo que comparten las dos rutas:
 *
 *  · Quien escribe manda un broadcast por HTTP al buzón del otro. El emisor
 *    NUNCA se suscribe ni hace join: `httpSend` POSTea al endpoint REST y
 *    devuelve 202 (realtime-js 2.95.3, RealtimeChannel.httpSend), así que esta
 *    ruta no toca el ciclo de vida del socket — que es justo donde el proyecto
 *    ya se rompió dos veces (#1603 el topic duplicado, #1605 la presencia).
 *  · Cada quien escucha solo su propio buzón: 1 canal nuevo por usuario, con
 *    topic propio, un solo dueño y montado una vez en el AppShell.
 *
 * NO se toca `online-users`, que sigue siendo presencia y ahí está bien.
 *
 * ⚠️ El receptor caduca cada aviso por su cuenta (TTL). Eso es lo que permite
 * que esto NO tenga que garantizar ENTREGA: si se pierde un
 * `false`, o el canal se cae, el peor caso es "no se ve" — nunca "se ve pegado
 * para siempre", que es el modo de falla que sí dolería en una lista.
 */

/** Cuánto vale un aviso de "está escribiendo" sin que lo refresquen.
 *
 *  El emisor repite el aviso cada REFRESCO_TYPING_MS (3s, useChat) mientras se
 *  teclea, y manda un `false` explícito al parar. Esto es la red de seguridad
 *  para cuando ese `false` no llega: un poco más que el latido, para no apagar
 *  el indicador de alguien que sí sigue escribiendo. */
export const TTL_TECLEO_MS = 5000;

/** Buzón de UNA persona: le llegan los avisos de todas sus conversaciones.
 *  Lo usa la LISTA (sidebar y nubecita). Solo DMs. */
const topicBuzon = (userId: string) => `typing-inbox-${userId}`;

/** Canal de UNA conversación: le llegan los avisos de quien la tenga abierta.
 *  Lo usa la CABECERA del chat abierto y la ventanita del muelle. Un solo aviso
 *  sirve para todos los miembros, así que acá sí entran los grupos. */
export const topicTecleoConversacion = (conversationId: string) =>
  `typing-conv-${conversationId}`;

type AvisoTecleo = { c: string; u: string; t: boolean };

// ── Emisor ────────────────────────────────────────────────────────────────
//
// Función de módulo a propósito, no un hook: la llama useChat, y un hook aquí
// crearía un import circular con el ChatProvider.
//
// Los objetos de canal se cachean y JAMÁS se suscriben. Son inertes para el
// socket: `channel()` los deja en el array local y dedupea por topic, y como
// nunca pasan de `closed` no programan rejoin ni entran en el ciclo join/close.
// clave = topic. Nunca se suscriben: solo se usan para httpSend.
const canalesBuzon = new Map<string, ReturnType<typeof supabase.channel>>();

function canalInerte(topic: string) {
  let canal = canalesBuzon.get(topic);
  if (!canal) {
    canal = supabase.channel(topic);
    canalesBuzon.set(topic, canal);
  }
  return canal;
}

/** Avisa a quien tenga ABIERTA esa conversación. Un solo POST, sirva para un DM
 *  o para un grupo de treinta. Lo lee el canal de `useMessages`. */
export function publicarTecleoEnConversacion(
  conversationId: string,
  userId: string,
  escribiendo: boolean,
) {
  void canalInerte(topicTecleoConversacion(conversationId))
    .httpSend("typing", { c: conversationId, u: userId, t: escribiendo } satisfies AvisoTecleo)
    .catch(() => {});
}

/** Avisa a los destinatarios que `userId` está (o dejó de estar) escribiendo
 *  en `conversationId`. Sin await: al que teclea no le importa el resultado, y
 *  el TTL del receptor cubre cualquier aviso perdido. */
export function publicarTecleo(
  destinatarios: string[],
  conversationId: string,
  userId: string,
  escribiendo: boolean,
) {
  for (const peer of destinatarios) {
    if (!peer || peer === userId) continue;
    void canalInerte(topicBuzon(peer))
      .httpSend("typing", { c: conversationId, u: userId, t: escribiendo } satisfies AvisoTecleo)
      .catch(() => {});
  }
}

// ── Receptor ──────────────────────────────────────────────────────────────

type TypingInboxContextType = {
  /** Quién está escribiendo en esa conversación, o null. */
  quienEscribe: (conversationId: string) => string | null;
};

const TypingInboxContext = createContext<TypingInboxContextType>({
  quienEscribe: () => null,
});

export function TypingInboxProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // conversationId → userId de quien escribe.
  const [tecleando, setTecleando] = useState<Record<string, string>>({});
  const temporizadores = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const [versionBuzon, setVersionBuzon] = useState(0);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    let cancelado = false;
    let reintento: ReturnType<typeof setTimeout> | null = null;
    const timers = temporizadores.current;

    const quitar = (convId: string) => {
      setTecleando((prev) => {
        if (!(convId in prev)) return prev; // misma identidad → sin re-render
        const siguiente = { ...prev };
        delete siguiente[convId];
        return siguiente;
      });
    };

    const canal = supabase
      .channel(topicBuzon(userId))
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const aviso = payload as Partial<AvisoTecleo> | undefined;
        const convId = aviso?.c;
        const quien = aviso?.u;
        if (!convId || !quien || quien === userId) return;

        const anterior = timers.get(convId);
        if (anterior) clearTimeout(anterior);
        timers.delete(convId);

        if (!aviso.t) {
          quitar(convId);
          return;
        }

        setTecleando((prev) => (prev[convId] === quien ? prev : { ...prev, [convId]: quien }));
        timers.set(
          convId,
          setTimeout(() => {
            timers.delete(convId);
            quitar(convId);
          }, TTL_TECLEO_MS),
        );
      });

    // Con callback A PROPÓSITO: `closed` es TERMINAL en realtime-js (su
    // `_onClose` saca el canal de socket.channels y `_onError` ni lo mira, así
    // que el rejoin automático NO lo cubre), y sin callback ni nos
    // enteraríamos: los handlers que traducen a CLOSED se registran DENTRO de
    // subscribe y solo si hay callback. Este buzón vive montado toda la sesión,
    // así que quedarse mudo acá sería para el resto del día.
    canal.subscribe((status) => {
      if (cancelado) return;
      if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setTecleando({});
        if (reintento) clearTimeout(reintento);
        reintento = setTimeout(() => {
          reintento = null;
          setVersionBuzon((v) => v + 1);
        }, 1000);
      }
    });

    return () => {
      cancelado = true;
      if (reintento) clearTimeout(reintento);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      supabase.removeChannel(canal);
      setTecleando({});
    };
  }, [user?.id, versionBuzon]);

  const quienEscribe = useCallback(
    (conversationId: string) => tecleando[conversationId] ?? null,
    [tecleando],
  );

  // La identidad solo cambia cuando cambia el conjunto de quienes teclean, para
  // no re-renderizar cincuenta filas por segundo.
  const valor = useMemo(() => ({ quienEscribe }), [quienEscribe]);

  return <TypingInboxContext.Provider value={valor}>{children}</TypingInboxContext.Provider>;
}

export function useTypingInbox() {
  return useContext(TypingInboxContext);
}
