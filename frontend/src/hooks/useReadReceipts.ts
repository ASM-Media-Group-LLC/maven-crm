import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface ReadReceipt {
  message_id: string;
  user_id: string;
  delivered_at: string | null;
  read_at: string | null;
}

// Marca mensajes como ENTREGADOS para un usuario. Insert-only (ignoreDuplicates): no pisa
// un delivered/read previo. Se llama desde useChat cuando el cliente RECIBE mensajes de otros
// (canal realtime global + backfill al abrir la conversación).
export async function markMessagesDelivered(userId: string, messageIds: string[]) {
  if (!userId || messageIds.length === 0) return;
  const now = new Date().toISOString();
  const rows = messageIds.map((id) => ({ message_id: id, user_id: userId, delivered_at: now }));
  await supabase
    .from("chat_read_receipts")
    .upsert(rows, { onConflict: "message_id,user_id", ignoreDuplicates: true });
}

export function useReadReceipts(conversationId: string | null, messages: { id: string; sender_id: string }[]) {
  const { user } = useAuth();
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
    const last50 = stableMessageIds.slice(-50);
    const { data } = await supabase
      .from("chat_read_receipts")
      .select("message_id, user_id, delivered_at, read_at")
      .in("message_id", last50);
    if (data) setReceipts(data as ReadReceipt[]);
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

  // Marcar como LEÍDO. Merge (sin ignoreDuplicates): si ya existe la fila de "entregado",
  // la actualiza poniendo read_at (deja delivered_at intacto porque no va en el payload).
  const markAsRead = useCallback(async (msgIds: string[]) => {
    if (!user || msgIds.length === 0) return;
    const rows = msgIds.map((id) => ({ message_id: id, user_id: user.id, read_at: new Date().toISOString() }));
    await supabase
      .from("chat_read_receipts")
      .upsert(rows, { onConflict: "message_id,user_id" });
  }, [user]);

  // Auto-marcar como leído los mensajes visibles solo con la ventana enfocada.
  const receiptsRef = useRef(receipts);
  receiptsRef.current = receipts;

  useEffect(() => {
    if (!user || !conversationId || stableOthersIds.length === 0) return;

    const markUnread = () => {
      if (!document.hasFocus()) return;
      // "sin leer" = mensaje de OTRO sin recibo MÍO con read_at (puede haber uno solo-entregado).
      const unread = stableOthersIds.filter(id =>
        !receiptsRef.current.find(r => r.message_id === id && r.user_id === user.id && r.read_at)
      );
      if (unread.length > 0) markAsRead(unread);
    };

    markUnread();

    window.addEventListener("focus", markUnread);
    return () => window.removeEventListener("focus", markUnread);
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
