import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";
import { useSaludDelChat } from "@/hooks/canalDelChat";
import type { RealtimeChannel } from "@supabase/supabase-js";

/** Cuántos ids caben en una consulta: la lista viaja en la URL. */
export const TANDA_RECIBOS = 100;

/** Cada cuánto se repasan los recibos de la conversación ABIERTA.
 *
 *  Es el reemplazo del aviso en vivo, que se apagó el 17/09 porque difundir cada
 *  "visto" a todos los suscriptores tumbó la base. La diferencia de costo es
 *  enorme: antes, un visto despertaba a TODOS los conectados; ahora es una
 *  consulta chica por persona, solo de la conversación que tiene abierta, y solo
 *  con la pestaña a la vista. */
export const REFRESCO_RECIBOS_MS = 7_000;

/** Cuando el realtime está caído, el "visto" se repasa aún más seguido: es el
 *  único modo de que se mueva mientras el socket no entrega. */
export const REFRESCO_RECIBOS_CAIDO_MS = 4_000;

export interface ReadReceipt {
  message_id: string;
  user_id: string;
  delivered_at: string | null;
  read_at: string | null;
}

// Marca mensajes como ENTREGADOS para un usuario. Insert-only (ignoreDuplicates): no pisa
// un delivered/read previo. Se llama desde useChat cuando el cliente RECIBE mensajes de otros
// (canal realtime global + backfill al abrir la conversación).
export async function markMessagesDelivered(userId: string, messageIds: string[]): Promise<boolean> {
  if (!userId || messageIds.length === 0) return true;
  const now = new Date().toISOString();
  const rows = messageIds.map((id) => ({ message_id: id, user_id: userId, delivered_at: now }));
  // ⚠️ DEVUELVE SI FUNCIONÓ. Antes se hacía `await` y se tiraba el error a la
  // basura. supabase-js no lanza excepción: devuelve `{ error }`. Así que un
  // upsert rechazado por permisos o cortado por tiempo pasaba por bueno y el
  // barrido avanzaba igual su marca — justo lo contrario de lo que promete.
  const { error } = await supabase
    .from("chat_read_receipts")
    .upsert(rows, { onConflict: "message_id,user_id", ignoreDuplicates: true });
  if (error) console.warn("[Recibos] no se pudo marcar entregado:", error.message);
  return !error;
}

export function useReadReceipts(conversationId: string | null, messages: { id: string; sender_id: string }[]) {
  const { user } = useAuth();
  const salud = useSaludDelChat();
  const [receipts, setReceipts] = useState<ReadReceipt[]>([]);

  // TODOS los ids (para cargar/mostrar recibos, incluidos los de mis propios mensajes).
  // Stabilize to avoid infinite channel re-subscriptions.
  const messageIdsKey = messages.map(m => m.id).join(",");
  const stableMessageIds = useMemo(() => messages.map(m => m.id), [messageIdsKey]);
  // Solo ids de mensajes de OTROS: uno NO "lee" sus propios mensajes → no generamos un
  // read_at propio inútil sobre lo que yo mismo mandé (antes se marcaba y ensuciaba la tabla).
  const othersIdsKey = messages.filter(m => m.sender_id !== user?.id).map(m => m.id).join(",");
  const stableOthersIds = useMemo(() => messages.filter(m => m.sender_id !== user?.id).map(m => m.id), [othersIdsKey]);

  const loadReceipts = useCallback(async () => {
    if (!conversationId || stableMessageIds.length === 0) { setReceipts([]); return; }
    // ⚠️ TODOS los mensajes cargados, no los últimos 50.
    //
    // Con `.slice(-50)` los mensajes de más arriba se quedaban SIN recibo en
    // memoria. Al abrir coincidía (la página son 50), pero al subir en la
    // conversación tus propios mensajes viejos volvían a dibujarse como ✓ simple
    // —parecía que nadie los había leído— y encima `markUnread` los tomaba por
    // "sin leer" y los re-marcaba en cada cambio, escribiendo de más en la tabla
    // que más escribe de todas.
    //
    // Se pide por tandas porque la lista viaja en la URL y con cientos de ids se
    // pasa de largo.
    const partes: ReadReceipt[] = [];
    for (let i = 0; i < stableMessageIds.length; i += TANDA_RECIBOS) {
      const { data, error } = await supabase
        .from("chat_read_receipts")
        .select("message_id, user_id, delivered_at, read_at")
        .in("message_id", stableMessageIds.slice(i, i + TANDA_RECIBOS));
      // Un fallo NO es "sin recibos": conservar lo que hay (si no, los ✓✓ parpadean
      // a ✓ simple justo cuando la red está inestable). El próximo repaso reintenta.
      if (error) return;
      if (data) partes.push(...(data as ReadReceipt[]));
    }
    setReceipts(partes);
  }, [conversationId, stableMessageIds]);

  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  // Refs para que la subscripción realtime NO dependa de la lista de mensajes (evita churn
  // de WebSocket por cada mensaje). Se suscribe UNA vez por conversación y filtra por Set.
  const trackedIdsRef = useRef<Set<string>>(new Set());
  trackedIdsRef.current = new Set(stableMessageIds);
  const loadReceiptsRef = useRef(loadReceipts);
  loadReceiptsRef.current = loadReceipts;

  // Realtime: "entregado" es un INSERT; "leído" sobre una fila ya entregada es un UPDATE.
  // Escuchamos AMBOS y hacemos merge por (message_id,user_id) para que el remitente vea la
  // transición ✓✓ gris → ✓✓ azul en vivo.
  useEffect(() => {
    if (!conversationId) return;
    const handle = (payload: { new?: ReadReceipt }) => {
      const r = payload.new;
      if (!r || !trackedIdsRef.current.has(r.message_id)) return;
      setReceipts((prev) => {
        const i = prev.findIndex((x) => x.message_id === r.message_id && x.user_id === r.user_id);
        if (i === -1) return [...prev, r];
        const next = prev.slice();
        next[i] = { ...next[i], ...r };
        return next;
      });
    };
    // `handle` cierra sobre este efecto; el canal vive en useCanalQueRevive.
    armarRecibosRef.current = (canal) => canal
      // ⚠️ ESTAS DOS ESCUCHAS YA NO RECIBEN NADA, a propósito (17/09/2026).
      // `chat_read_receipts` salió de la publicación de Realtime porque era, con
      // diferencia, la tabla que más escribía de las 25 publicadas —casi un
      // millón de escrituras, 4,5 veces la siguiente— y difundir cada "visto" a
      // todos los suscriptores tenía a la base de rodillas: se cayó Maven.
      // Se dejan puestas para que volver atrás sea UNA línea de SQL
      // (ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_read_receipts)
      // sin tocar el frontend. Los ✓✓ se leen igual al abrir la conversación,
      // con la consulta de más arriba; lo que se pierde es que se muevan solos.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_read_receipts" }, handle)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_read_receipts" }, handle);
  }, [conversationId]);

  const armarRecibosRef = useRef<((canal: RealtimeChannel) => RealtimeChannel) | null>(null);
  useCanalQueRevive({
    topic: conversationId ? `read-receipts-${conversationId}` : null,
    armar: (canal) => armarRecibosRef.current?.(canal) ?? canal,
    // Antes solo se recargaba en CHANNEL_ERROR/TIMED_OUT y el canal muerto se
    // quedaba muerto; CLOSED —el terminal— ni se miraba.
    alRevivir: () => void loadReceiptsRef.current(),
  });

  // ── QUE LOS ✓✓ VUELVAN A MOVERSE SOLOS ──────────────────────────────────
  //
  // Con la tabla fuera de la replicación en vivo, los recibos solo se recargaban
  // cuando cambiaba la lista de mensajes. O sea que tus ✓ iban SIEMPRE un mensaje
  // atrasados: mandabas A, te lo leían, no pasaba nada; mandabas B y recién ahí A
  // saltaba a ✓✓. Eso es lo que se veía "impreciso".
  //
  // Se repasa la conversación abierta cada 12 s, y solo con la pestaña a la
  // vista: sin nadie mirando no hay ✓ que actualizar, y así no se gasta en las
  // pestañas de fondo, que son la mayoría. Al volver a la pestaña se repasa de
  // inmediato, para no esperar el turno.
  useEffect(() => {
    if (!conversationId) return;
    const repasar = () => {
      if (document.visibilityState !== "visible") return;
      void loadReceiptsRef.current();
    };
    const cada = salud === "reconectando" ? REFRESCO_RECIBOS_CAIDO_MS : REFRESCO_RECIBOS_MS;
    const id = window.setInterval(repasar, cada);
    document.addEventListener("visibilitychange", repasar);
    // Al cambiar la salud (vuelve el realtime) o al reabrir, ponerse al día ya.
    repasar();
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", repasar);
    };
  }, [conversationId, salud]);

  // Marcar como LEÍDO. Merge (sin ignoreDuplicates): si ya existe la fila de "entregado",
  // la actualiza poniendo read_at (deja delivered_at intacto porque no va en el payload).
  const markAsRead = useCallback(async (msgIds: string[]) => {
    if (!user || msgIds.length === 0) return;
    const rows = msgIds.map((id) => ({ message_id: id, user_id: user.id, read_at: new Date().toISOString() }));
    await supabase
      .from("chat_read_receipts")
      .upsert(rows, { onConflict: "message_id,user_id" });
  }, [user]);

  // Auto-marcar como leído los mensajes de la conversación abierta.
  const receiptsRef = useRef(receipts);
  receiptsRef.current = receipts;

  useEffect(() => {
    if (!user || !conversationId || stableOthersIds.length === 0) return;

    const markUnread = () => {
      // ⚠️ MISMA REGLA QUE LA BURBUJA DE NO LEÍDOS, a propósito.
      //
      // Acá se exigía `document.hasFocus()` y la burbuja (useChat) no exigía
      // nada. Resultado: quien abría el chat en una ventana de fondo se limpiaba
      // su propia burbuja, pero al que mandó el mensaje le seguía en gris. Dos
      // sistemas dando respuestas distintas sobre el mismo hecho, y esa
      // contradicción se ve como imprecisión.
      //
      // Se unifican en "la pestaña está a la vista", que es lo que de verdad
      // significa que la conversación está delante de alguien. Tener el foco es
      // más estricto de la cuenta: una ventana visible en un segundo monitor
      // cuenta como vista, y así lo trata la burbuja.
      if (document.visibilityState !== "visible") return;
      // "sin leer" = mensaje de OTRO sin recibo MÍO con read_at (puede haber uno solo-entregado).
      const unread = stableOthersIds.filter(id =>
        !receiptsRef.current.find(r => r.message_id === id && r.user_id === user.id && r.read_at)
      );
      if (unread.length > 0) markAsRead(unread);
    };

    markUnread();

    window.addEventListener("focus", markUnread);
    document.addEventListener("visibilitychange", markUnread);
    return () => {
      window.removeEventListener("focus", markUnread);
      document.removeEventListener("visibilitychange", markUnread);
    };
  }, [stableOthersIds, user, conversationId, markAsRead]);

  const getReadBy = useCallback((messageId: string): string[] => {
    return receipts
      .filter(r => r.message_id === messageId && r.user_id !== user?.id && !!r.read_at)
      .map(r => r.user_id);
  }, [receipts, user]);

  // Entregado incluye leído (leer implica entregar), aunque delivered_at sea null.
  const getDeliveredBy = useCallback((messageId: string): string[] => {
    return receipts
      .filter(r => r.message_id === messageId && r.user_id !== user?.id && (!!r.delivered_at || !!r.read_at))
      .map(r => r.user_id);
  }, [receipts, user]);

  const getReadCount = useCallback((messageId: string): number => {
    return receipts.filter(r => r.message_id === messageId && r.user_id !== user?.id && !!r.read_at).length;
  }, [receipts, user]);

  return { getReadBy, getDeliveredBy, getReadCount, markAsRead };
}
