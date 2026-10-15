import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";
import { useSaludDelChat } from "@/hooks/canalDelChat";

/** Repaso de las reacciones de la conversación abierta. `chat_reactions` no está
 *  en la replicación en vivo (quedó fuera como `chat_read_receipts`, por el mismo
 *  costo de difundir a todos), así que, igual que el "visto", se mueven con un
 *  repaso corto de la conversación abierta y solo con la pestaña a la vista. */
export const REFRESCO_REACCIONES_MS = 7_000;
export const REFRESCO_REACCIONES_CAIDO_MS = 4_000;

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  users: string[];
  includesMe: boolean;
}

export function useReactions(conversationId: string | null) {
  const { user } = useAuth();
  const salud = useSaludDelChat();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const reactionsRef = useRef<Reaction[]>([]);
  // Cuándo fue el último toggle: el repaso (reemplazo total) se salta si hay uno
  // recién hecho, para no pisar la reacción optimista mientras la base confirma.
  const ultimoToggleRef = useRef(0);

  useEffect(() => { reactionsRef.current = reactions; }, [reactions]);

  // Load reactions only for tracked message IDs (not all messages in conversation)
  const loadReactionsForMessages = useCallback(async (msgIds: string[]) => {
    if (msgIds.length === 0) return;
    const chunks: string[][] = [];
    for (let i = 0; i < msgIds.length; i += 100) {
      chunks.push(msgIds.slice(i, i + 100));
    }
    const results = await Promise.all(
      chunks.map(chunk =>
        supabase.from("chat_reactions").select("*").in("message_id", chunk)
      )
    );
    // Un fallo NO es "sin reacciones": si alguna tanda falló, conservar lo que hay
    // (si no, se borrarían en pantalla hasta el próximo repaso). Reintenta luego.
    if (results.some((r) => r.error)) return;
    const allReactions: Reaction[] = [];
    for (const { data } of results) {
      if (data) allReactions.push(...(data as Reaction[]));
    }
    setReactions(allReactions);
  }, []);

  // When conversation changes, clear and reload
  useEffect(() => {
    if (!conversationId) {
      setReactions([]);
      messageIdsRef.current = new Set();
      return;
    }
    // Reactions will load when addMessageId is called with the visible messages
  }, [conversationId]);

  // Realtime: apply payloads inline instead of full refresh
  useCanalQueRevive({
    topic: conversationId ? `reactions-${conversationId}` : null,
    armar: (canal) => canal
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_reactions" }, (payload) => {
        const newReaction = payload.new as Reaction;
        if (!messageIdsRef.current.has(newReaction.message_id)) return;
        setReactions(prev => {
          if (prev.some(r => r.id === newReaction.id)) return prev;
          return [...prev, newReaction];
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_reactions" }, (payload) => {
        const oldReaction = payload.old as Partial<Reaction>;
        if (!oldReaction.id) return;
        setReactions(prev => prev.filter(r => r.id !== oldReaction.id));
      }),
    // Mientras estuvo muerto se perdieron reacciones: volver a traer las de
    // los mensajes que hay en pantalla.
    alRevivir: () => void loadReactionsForMessages(Array.from(messageIdsRef.current)),
  });

  // Repaso de la conversación abierta: lo que hace que las reacciones se muevan
  // solas (la tabla no está en vivo). Solo con la pestaña a la vista; más seguido
  // si el realtime está caído. Al cambiar la salud se pone al día de una.
  useEffect(() => {
    if (!conversationId) return;
    const repasar = () => {
      if (document.visibilityState !== "visible") return;
      // Hay un toggle recién hecho: esperar al próximo tick para no pisar la
      // reacción optimista antes de que la base la confirme.
      if (Date.now() - ultimoToggleRef.current < 2500) return;
      const ids = Array.from(messageIdsRef.current);
      if (ids.length) void loadReactionsForMessages(ids);
    };
    const cada = salud === "reconectando" ? REFRESCO_REACCIONES_CAIDO_MS : REFRESCO_REACCIONES_MS;
    const id = window.setInterval(repasar, cada);
    document.addEventListener("visibilitychange", repasar);
    repasar();
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", repasar);
    };
  }, [conversationId, salud, loadReactionsForMessages]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    ultimoToggleRef.current = Date.now();

    const current = reactionsRef.current;
    const existing = current.find(
      r => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji
    );

    if (existing) {
      setReactions(prev => prev.filter(r => r.id !== existing.id));
      const { error } = await supabase.from("chat_reactions").delete().eq("id", existing.id);
      if (error) {
        setReactions(prev =>
          prev.find(r => r.id === existing.id) ? prev : [...prev, existing]
        );
      }
      return;
    }

    const tempId = crypto.randomUUID();
    const tempReaction: Reaction = {
      id: tempId,
      message_id: messageId,
      user_id: user.id,
      emoji,
      created_at: new Date().toISOString(),
    };
    setReactions(prev => [...prev, tempReaction]);

    const { data, error } = await supabase.from("chat_reactions").insert({
      message_id: messageId,
      user_id: user.id,
      emoji,
    }).select().single();

    if (data) {
      setReactions(prev => {
        const withoutTemp = prev.filter(r => r.id !== tempId);
        return withoutTemp.some(r => r.id === (data as Reaction).id)
          ? withoutTemp
          : [...withoutTemp, data as Reaction];
      });
    } else if (error) {
      setReactions(prev => prev.filter(r => r.id !== tempId));
    }
  }, [user]);

  // Track message IDs and trigger initial load when batch is complete
  const pendingIdsRef = useRef<string[]>([]);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addMessageId = useCallback((msgId: string) => {
    if (messageIdsRef.current.has(msgId)) return;
    messageIdsRef.current.add(msgId);
    pendingIdsRef.current.push(msgId);

    // Debounce: wait for batch of addMessageId calls to finish, then load
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => {
      const ids = Array.from(messageIdsRef.current);
      pendingIdsRef.current = [];
      loadReactionsForMessages(ids);
    }, 100);
  }, [loadReactionsForMessages]);

  const getReactionsForMessage = useCallback((messageId: string): ReactionGroup[] => {
    const msgReactions = reactions.filter(r => r.message_id === messageId);
    const grouped: Record<string, { count: number; users: string[]; includesMe: boolean }> = {};
    msgReactions.forEach(r => {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, users: [], includesMe: false };
      grouped[r.emoji].count++;
      grouped[r.emoji].users.push(r.user_id);
      if (r.user_id === user?.id) grouped[r.emoji].includesMe = true;
    });
    return Object.entries(grouped).map(([emoji, data]) => ({ emoji, ...data }));
  }, [reactions, user]);

  return { toggleReaction, getReactionsForMessage, addMessageId };
}
