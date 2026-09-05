import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Buzón de tecleo: cómo se entera la LISTA de que alguien está escribiendo.
 *
 * El chat abierto y la ventanita del muelle ya lo saben por el canal de
 * presencia `typing-<conversationId>` de useChat, pero ese canal SOLO existe
 * para la conversación abierta. Para pintarlo también en el sidebar y en la
 * nubecita haría falta uno por conversación (media 9, máximo 49, por 70
 * personas) — que es exactamente el patrón que hizo que Supabase cortara el
 * socket en #1605.
 *
 * En vez de eso, UN canal por PERSONA:
 *
 *  · Quien escribe manda un broadcast por HTTP al buzón del otro. El emisor
 *    NUNCA se suscribe ni hace join: `httpSend` POSTea al endpoint REST y
 *    devuelve 202 (realtime-js 2.95.3, RealtimeChannel.httpSend), así que esta
 *    ruta no toca el ciclo de vida del socket — que es justo donde el proyecto
 *    ya se rompió dos veces (#1603 el topic duplicado, #1605 la presencia).
 *  · Cada quien escucha solo su propio buzón: 1 canal nuevo por usuario, con
 *    topic propio, un solo dueño y montado una vez en el AppShell.
 *
 * NO se toca `typing-<conv>` ni `online-users` ni ningún canal por
 * conversación.
 *
 * ⚠️ El receptor caduca cada aviso por su cuenta (TTL). Eso es lo que permite
 * que esto NO tenga que garantizar entrega ni reconexión: si se pierde un
 * `false`, o el canal se cae, el peor caso es "no se ve" — nunca "se ve pegado
 * para siempre", que es el modo de falla que sí dolería en una lista.
 */

/** Cuánto vale un aviso de "está escribiendo" sin que lo refresquen.
 *
 *  El emisor repite el aviso cada REFRESCO_TYPING_MS (3s, useChat) mientras se
 *  teclea, y manda un `false` explícito al parar. Esto es la red de seguridad
 *  para cuando ese `false` no llega: un poco más que el latido, para no apagar
 *  el indicador de alguien que sí sigue escribiendo. */
const TTL_TECLEO_MS = 5000;

const topicBuzon = (userId: string) => `typing-inbox-${userId}`;

type AvisoTecleo = { c: string; u: string; t: boolean };

// ── Emisor ────────────────────────────────────────────────────────────────
//
// Función de módulo a propósito, no un hook: la llama useChat, y un hook aquí
// crearía un import circular con el ChatProvider.
//
// Los objetos de canal se cachean y JAMÁS se suscriben. Son inertes para el
// socket: `channel()` los deja en el array local y dedupea por topic, y como
// nunca pasan de `closed` no programan rejoin ni entran en el ciclo join/close.
const canalesBuzon = new Map<string, ReturnType<typeof supabase.channel>>();

function buzonDe(userId: string) {
  let canal = canalesBuzon.get(userId);
  if (!canal) {
    canal = supabase.channel(topicBuzon(userId));
    canalesBuzon.set(userId, canal);
  }
  return canal;
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
    void buzonDe(peer)
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

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

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

    canal.subscribe();

    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      supabase.removeChannel(canal);
      setTecleando({});
    };
  }, [user?.id]);

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
