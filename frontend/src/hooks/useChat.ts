import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  publicarTecleo,
  publicarTecleoEnConversacion,
  topicTecleoConversacion,
  TTL_TECLEO_MS,
} from "@/hooks/useTypingInbox";
import { useAuth } from "@/hooks/useAuth";
import { useReanudarAlVolver } from "@/hooks/useReanudarAlVolver";
import { cerrarNotificacionesDeChat } from "@/lib/insigniaDeLaApp";
import {
  ChatConversation,
  ChatMessage,
  ChatParticipant,
  ConversationWithDetails,
  UserProfile,
} from "@/pages/messenger/types";
import { profileName } from "@/pages/messenger/utils";
import { markMessagesDelivered } from "@/hooks/useReadReceipts";
import { addPending, removePending, pendingForConversation } from "@/pages/messenger/pendingQueue";
import { toast } from "sonner";

export function useChat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const [chatRealtimeVersion, setChatRealtimeVersion] = useState(0);
  // Al volver a primer plano tras >30 s oculto (teléfono bloqueado, otra app), el
  // socket suele estar muerto y el canal en CLOSED: se recrea (topic con versión
  // nueva) y SUBSCRIBED vuelve a cargar la lista.
  useReanudarAlVolver(() => setChatRealtimeVersion((v) => v + 1));
  const chatRealtimeRetryRef = useRef(0);
  const chatRealtimeReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Para quién ya se cargó la lista: distingue la primera carga (que sí muestra
  // "Cargando…") de las recargas de fondo. Guarda el id y no un booleano para
  // que al cambiar de cuenta vuelva a considerarse primera vez.
  const cargadoParaRef = useRef<string | null>(null);

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, avatar_seed, whatsapp_push_name");
    if (data) {
      const map: Record<string, UserProfile> = {};
      data.forEach((p: any) => { map[p.id] = p; });
      setProfiles(map);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    if (!user) return;

    // `loading` SOLO en la primera carga de esta sesión. Antes se prendía en
    // cada llamada, y como hay un poll de 20s (+ visibilitychange + reconexión
    // del realtime), la lista se reemplazaba por "Cargando…" tres veces por
    // minuto: eso era el parpadeo de la nube que se veía como si se refrescara
    // sola. Las recargas de fondo ahora entran calladas — se cambia el
    // contenido, no el estado visible.
    const primeraVez = cargadoParaRef.current !== user.id;
    if (primeraVez) setLoading(true);
    try {
      const { data: participations } = await supabase
        .from("chat_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", user.id);

      if (!participations || participations.length === 0) {
        setConversations([]);
        return;
      }

      const convIds = participations.map((p: any) => p.conversation_id);
      const lastReadMap: Record<string, string | null> = {};
      participations.forEach((p: any) => { lastReadMap[p.conversation_id] = p.last_read_at; });

      // Batch: conversations, all participants, and the last message of each chat.
      // get_last_messages devuelve UNA fila por conversación (LATERAL sobre el
      // índice). Antes esto era un lote global de los N*2 mensajes más nuevos +
      // una petición suelta por cada chat que no apareciera: 11,4 peticiones por
      // refresco medidas en prod, y los chats de más se quedaban sin vista previa.
      const [convsResult, allParticipantsResult, lastMsgsResult] = await Promise.all([
        supabase
          .from("chat_conversations")
          .select("*")
          .in("id", convIds)
          .order("updated_at", { ascending: false }),
        supabase
          .from("chat_participants")
          .select("*")
          .in("conversation_id", convIds),
        supabase.rpc("get_last_messages", { _user_id: user.id }),
      ]);

      const convs = convsResult.data;
      const allParticipants = allParticipantsResult.data;

      if (!convs) {
        setConversations([]);
        return;
      }

      // Un chat sin mensajes simplemente no viene en la respuesta y se queda sin
      // vista previa, igual que antes.
      const lastMessageMap: Record<string, ChatMessage> = {};
      for (const msg of (lastMsgsResult.data ?? []) as ChatMessage[]) {
        lastMessageMap[msg.conversation_id] = msg;
      }

      // Server-side unread counts — single RPC call
      const unreadMap: Record<string, number> = {};
      const { data: unreadData } = await supabase.rpc("get_unread_counts", { _user_id: user.id });
      if (unreadData) {
        for (const row of unreadData as any[]) {
          unreadMap[row.conversation_id] = row.unread_count || 0;
        }
      }

      const enriched: ConversationWithDetails[] = convs.map((conv: any) => {
        const convParticipants = (allParticipants || []).filter(
          (p: any) => p.conversation_id === conv.id
        );

        const lastMessage = lastMessageMap[conv.id];

        let displayName = conv.name || "";
        if (conv.type === "direct") {
          const otherParticipant = convParticipants.find(
            (p: any) => p.user_id !== user.id
          );
          if (otherParticipant) {
            displayName = profileName(profilesRef.current[otherParticipant.user_id]);
          }
        }

        return {
          ...conv,
          participants: convParticipants.map((p: any) => ({
            ...p,
            profile: profilesRef.current[p.user_id],
          })),
          lastMessage,
          unreadCount: unreadMap[conv.id] || 0,
          displayName,
        } as ConversationWithDetails;
      });

      // Filter: hide direct chats from the non-creator until a message is sent
      const visible = enriched.filter(conv => {
        if (conv.type === "direct" && conv.created_by !== user.id && !conv.lastMessage) {
          return false;
        }
        return true;
      });

      visible.sort((a, b) => {
        const aTime = a.lastMessage?.created_at || a.updated_at;
        const bTime = b.lastMessage?.created_at || b.updated_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      setConversations(visible);
      cargadoParaRef.current = user.id;
    } finally {
      if (primeraVez) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfiles().then(() => loadConversations());
  }, [loadProfiles, loadConversations]);

  // Realtime subscription for conversation sync
  useEffect(() => {
    if (!user) return;

    // Throttled reload: avoid debounce starvation under high event volume
    const pendingReloadRef = { timer: null as ReturnType<typeof setTimeout> | null };
    const scheduleConversationsReload = (immediate = false) => {
      if (pendingReloadRef.timer) {
        if (!immediate) return;
        clearTimeout(pendingReloadRef.timer);
        pendingReloadRef.timer = null;
      }

      const delay = immediate ? 50 : 350;
      pendingReloadRef.timer = setTimeout(() => {
        pendingReloadRef.timer = null;
        void loadConversations();
      }, delay);
    };

    const isKnownConversation = (conversationId?: string | null) => {
      if (!conversationId) return false;
      return conversationsRef.current.some((c) => c.id === conversationId);
    };

    // Inline update: when a new message arrives, update the sidebar without full reload
    const updateConversationWithMessage = (msg: any) => {
      if (!msg?.conversation_id || msg.is_deleted) return;

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === msg.conversation_id);
        if (idx === -1) return prev;

        const conv = prev[idx];
        const isMine = msg.sender_id === user.id;
        const updated = {
          ...conv,
          lastMessage: msg as ChatMessage,
          updated_at: msg.created_at,
          unreadCount: isMine ? conv.unreadCount : conv.unreadCount + 1,
        };

        const next = [...prev];
        next.splice(idx, 1);
        next.unshift(updated);
        return next;
      });
    };

    const scheduleChannelReconnect = () => {
      if (chatRealtimeReconnectTimerRef.current) return;

      chatRealtimeRetryRef.current += 1;
      const delay = Math.min(1000 * Math.pow(2, chatRealtimeRetryRef.current), 15000);
      chatRealtimeReconnectTimerRef.current = setTimeout(() => {
        chatRealtimeReconnectTimerRef.current = null;
        setChatRealtimeVersion((v) => v + 1);
      }, delay);
    };

    // El removeChannel del cleanup dispara CLOSED: sin este guard programaría
    // un reconnect zombi del canal que acabamos de cerrar a propósito.
    let cancelado = false;
    const channel = supabase
      .channel(`chat-realtime-${user.id}-${chatRealtimeVersion}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const msg = payload.new as any;
          if (!isKnownConversation(msg?.conversation_id)) return;
          updateConversationWithMessage(msg);
          // Ack "entregado": llegó un mensaje de otro por el canal global (aunque el chat no
          // esté abierto) → marcar entregado para que el remitente vea ✓✓ gris.
          if (msg?.id && msg.sender_id !== user.id) {
            void markMessagesDelivered(user.id, [msg.id]);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages" },
        (payload) => {
          const msg = payload.new as any;
          if (!isKnownConversation(msg?.conversation_id)) return;

          setConversations((prev) => {
            const conv = prev.find((c) => c.id === msg.conversation_id);
            if (!conv) return prev;

            // If this was the lastMessage and it got soft-deleted, refresh latest message
            if (conv.lastMessage?.id === msg.id && msg.is_deleted) {
              scheduleConversationsReload();
              return prev;
            }

            if (conv.lastMessage?.id === msg.id) {
              return prev.map((c) =>
                c.id === msg.conversation_id
                  ? { ...c, lastMessage: msg as ChatMessage }
                  : c
              );
            }
            return prev;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        (payload) => {
          const old = payload.old as any;
          if (!isKnownConversation(old?.conversation_id)) return;

          setConversations((prev) => {
            const affected = prev.find((c) => c.lastMessage?.id === old.id);
            if (affected) {
              scheduleConversationsReload();
            }
            return prev;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_participants" },
        (payload) => {
          const newRow = payload.new as any;
          if (!newRow?.conversation_id) return;

          const isForMe = newRow.user_id === user.id;
          if (isForMe) {
            scheduleConversationsReload(true);
            return;
          }

          if (!isKnownConversation(newRow.conversation_id)) return;

          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== newRow.conversation_id) return conv;
              if (conv.participants.some((p) => p.user_id === newRow.user_id)) return conv;

              return {
                ...conv,
                participants: [
                  ...conv.participants,
                  {
                    ...newRow,
                    profile: profilesRef.current[newRow.user_id],
                  },
                ],
              };
            })
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_participants" },
        (payload) => {
          const old = payload.old as any;
          if (!old?.conversation_id) return;

          if (old.user_id === user.id) {
            scheduleConversationsReload(true);
            return;
          }

          if (!isKnownConversation(old.conversation_id)) return;

          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === old.conversation_id
                ? {
                    ...conv,
                    participants: conv.participants.filter((p) => p.user_id !== old.user_id),
                  }
                : conv
            )
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_participants" },
        (payload) => {
          const row = payload.new as any;
          if (!row?.conversation_id) return;

          if (row.user_id === user.id) {
            const old = payload.old as any;
            if (
              old &&
              row.last_read_at !== old.last_read_at &&
              row.is_muted === old.is_muted &&
              row.notifications_mode === old.notifications_mode &&
              row.role === old.role
            ) {
              return; // Skip read-receipt-only updates
            }
            scheduleConversationsReload(true);
            return;
          }

          if (!isKnownConversation(row.conversation_id)) return;

          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== row.conversation_id) return conv;

              return {
                ...conv,
                participants: conv.participants.map((p) =>
                  p.user_id === row.user_id ? { ...p, ...row } : p
                ),
              };
            })
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_conversations" },
        (payload) => {
          const updated = payload.new as any;
          if (!isKnownConversation(updated?.id)) return;

          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === updated.id);
            if (idx === -1) return prev;
            const patched = {
              ...prev[idx],
              name: updated.name,
              avatar_url: updated.avatar_url,
              description: updated.description,
            };
            if (patched.type === "group" && updated.name) patched.displayName = updated.name;
            const next = [...prev];
            next[idx] = patched;
            return next;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_conversations" },
        (payload) => {
          const old = payload.old as any;
          setConversations((prev) => prev.filter((c) => c.id !== old.id));
        }
      )
      .subscribe((status) => {
        if (cancelado) return;
        if (status === "SUBSCRIBED") {
          chatRealtimeRetryRef.current = 0;
          if (chatRealtimeReconnectTimerRef.current) {
            clearTimeout(chatRealtimeReconnectTimerRef.current);
            chatRealtimeReconnectTimerRef.current = null;
          }
          void loadConversations();
        }

        // CLOSED también: es terminal (el socket murió en segundo plano y nadie lo
        // vuelve a levantar); antes solo se atendían ERROR y TIMED_OUT.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          scheduleConversationsReload(true);
          scheduleChannelReconnect();
        }
      });

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadConversations();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Fallback sync por si el websocket se cae. El realtime ya trae los cambios en
    // vivo, así que esto es solo red de seguridad → 20s (antes 5s recargaba toda la
    // lista 12×/min de más). visibilitychange + reconexión del canal cubren el resto.
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadConversations();
      }
    }, 20_000);

    return () => {
      if (pendingReloadRef.timer) clearTimeout(pendingReloadRef.timer);
      if (chatRealtimeReconnectTimerRef.current) {
        clearTimeout(chatRealtimeReconnectTimerRef.current);
        chatRealtimeReconnectTimerRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(pollInterval);
      cancelado = true;
      supabase.removeChannel(channel);
    };
  }, [user, loadConversations, chatRealtimeVersion]);

  const createDirectChat = useCallback(
    (otherUserId: string, onResolved?: (realId: string) => void): string | null => {
      if (!user) return null;

      // Use ref for up-to-date conversations (avoid stale closures)
      const currentConvs = conversationsRef.current;
      const existing = currentConvs.find(
        (c) =>
          c.type === "direct" &&
          c.participants.some((p) => p.user_id === otherUserId)
      );
      if (existing) return existing.id;

      const newConvId = crypto.randomUUID();
      const now = new Date().toISOString();
      const otherProfile = profilesRef.current[otherUserId];

      const optimisticConv: ConversationWithDetails = {
        id: newConvId,
        type: "direct",
        name: null,
        description: null,
        avatar_url: null,
        created_by: user.id,
        created_at: now,
        updated_at: now,
        participants: [
          {
            id: crypto.randomUUID(),
            conversation_id: newConvId,
            user_id: user.id,
            role: "admin",
            joined_at: now,
            last_read_at: now,
            is_muted: false,
            notifications_mode: "all",
            profile: profilesRef.current[user.id],
          },
          {
            id: crypto.randomUUID(),
            conversation_id: newConvId,
            user_id: otherUserId,
            role: "member",
            joined_at: now,
            last_read_at: null,
            is_muted: false,
            notifications_mode: "all",
            profile: otherProfile,
          },
        ],
        unreadCount: 0,
        displayName: otherProfile?.full_name || "Chat",
      };

      setConversations((prev) => [optimisticConv, ...prev]);

      (async () => {
        // Check server-side for existing direct chat with this user
        const { data: myParticipations } = await supabase
          .from("chat_participants")
          .select("conversation_id")
          .eq("user_id", user.id);

        if (myParticipations && myParticipations.length > 0) {
          const myConvIds = myParticipations.map((p: any) => p.conversation_id);
          
          // Find if otherUserId is in any of my direct conversations
          const { data: otherP } = await supabase
            .from("chat_participants")
            .select("conversation_id, chat_conversations!inner(type)")
            .eq("user_id", otherUserId)
            .eq("chat_conversations.type", "direct")
            .in("conversation_id", myConvIds)
            .limit(1);

          if (otherP && otherP.length > 0) {
            // El DM ya existía en el server (a veces oculto: un directo sin mensajes creado
            // por el otro no aparece en mi lista). Antes solo borrábamos la conv optimista
            // → el chat abierto se cerraba solo y NUNCA se podía reabrir. Ahora reapuntamos
            // al id real y reseleccionamos: si ya está en la lista quitamos la optimista;
            // si no, reusamos la optimista con el id real (queda visible: created_by = yo).
            const existingConvId = otherP[0].conversation_id;
            setConversations((prev) =>
              prev.some((c) => c.id === existingConvId)
                ? prev.filter((c) => c.id !== newConvId)
                : prev.map((c) => (c.id === newConvId ? { ...c, id: existingConvId } : c))
            );
            onResolved?.(existingConvId);
            return;
          }
        }

        const { error: createConvError } = await supabase
          .from("chat_conversations")
          .insert({ id: newConvId, type: "direct", created_by: user.id });

        if (createConvError) {
          setConversations((prev) => prev.filter((c) => c.id !== newConvId));
          toast.error("Error al crear conversación");
          return;
        }

        const { error: addCreatorError } = await supabase
          .from("chat_participants")
          .insert({ conversation_id: newConvId, user_id: user.id, role: "admin" });

        if (addCreatorError) {
          await supabase.from("chat_conversations").delete().eq("id", newConvId);
          setConversations((prev) => prev.filter((c) => c.id !== newConvId));
          toast.error("Error al crear conversación");
          return;
        }

        const { error: addOtherError } = await supabase
          .from("chat_participants")
          .insert({ conversation_id: newConvId, user_id: otherUserId, role: "member" });

        if (addOtherError) {
          await supabase.from("chat_participants").delete().eq("conversation_id", newConvId);
          await supabase.from("chat_conversations").delete().eq("id", newConvId);
          setConversations((prev) => prev.filter((c) => c.id !== newConvId));
          toast.error("Error al crear conversación");
          return;
        }
      })();

      return newConvId;
    },
    [user]
  );

  const createGroupChat = useCallback(
    (name: string, memberIds: string[]): string | null => {
      if (!user) return null;

      const newConvId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Optimistic UI — instant navigation
      const optimisticConv: ConversationWithDetails = {
        id: newConvId,
        type: "group",
        name,
        description: null,
        avatar_url: null,
        created_by: user.id,
        created_at: now,
        updated_at: now,
        participants: [
          { id: crypto.randomUUID(), conversation_id: newConvId, user_id: user.id, role: "admin", joined_at: now, last_read_at: now, is_muted: false, notifications_mode: "all", profile: profilesRef.current[user.id] },
          ...memberIds.map(id => ({
            id: crypto.randomUUID(), conversation_id: newConvId, user_id: id, role: "member" as const, joined_at: now, last_read_at: null, is_muted: false, notifications_mode: "all" as const, profile: profilesRef.current[id],
          })),
        ],
        unreadCount: 0,
        displayName: name,
      };
      setConversations(prev => [optimisticConv, ...prev]);

      // Background persist — fire and forget
      (async () => {
        const { error: createConvError } = await supabase
          .from("chat_conversations")
          .insert({ id: newConvId, type: "group", name, created_by: user.id });

        if (createConvError) {
          setConversations(prev => prev.filter(c => c.id !== newConvId));
          toast.error("Error al crear grupo");
          return;
        }

        const { error: addCreatorError } = await supabase.from("chat_participants").insert(
          { conversation_id: newConvId, user_id: user.id, role: "admin" }
        );

        if (addCreatorError) {
          await supabase.from("chat_conversations").delete().eq("id", newConvId);
          setConversations(prev => prev.filter(c => c.id !== newConvId));
          toast.error("Error al crear grupo");
          return;
        }

        if (memberIds.length > 0) {
          const { error: addMembersError } = await supabase.from("chat_participants").insert(
            memberIds.map((id) => ({
              conversation_id: newConvId,
              user_id: id,
              role: "member" as const,
            }))
          );

          if (addMembersError) {
            await supabase.from("chat_participants").delete().eq("conversation_id", newConvId);
            await supabase.from("chat_conversations").delete().eq("id", newConvId);
            setConversations(prev => prev.filter(c => c.id !== newConvId));
            toast.error("Error al crear grupo");
            return;
          }
        }

        toast.success(`Grupo "${name}" creado`);
      })();

      return newConvId;
    },
    [user]
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!user) return false;

      // Save for rollback
      const prevConversations = conversationsRef.current;

      // Optimistic UI — remove instantly
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));

      try {
        const { error } = await supabase.rpc("delete_conversation_cascade", {
          _conversation_id: conversationId,
        });

        if (error) throw error;

        toast.success("Conversación eliminada");
        return true;
      } catch (err) {
        console.error("Error deleting conversation:", err);
        toast.error("Error al eliminar conversación");
        // Rollback: restore previous state
        setConversations(prevConversations);
        return false;
      }
    },
    [user]
  );

  // Clear unread count locally and persist read state immediately
  const markConversationRead = useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId && c.unreadCount > 0
          ? { ...c, unreadCount: 0 }
          : c
      )
    );

    if (!user) return;

    // Leído = sus avisos del sistema se van del centro de notificaciones.
    void cerrarNotificacionesDeChat(conversationId);
    supabase
      .from("chat_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .then();
  }, [user]);

  // Silenciar / reactivar una conversación (contacto o grupo) para el usuario actual.
  // Actualiza chat_participants.is_muted; el hook global useMessengerNotifications lo respeta
  // para NO sonar/avisar en conversaciones silenciadas (los recibos ✓✓ siguen igual).
  const toggleMute = useCallback(async (conversationId: string, muted: boolean) => {
    if (!user) return;

    const applyMuted = (value: boolean) =>
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                participants: c.participants.map((p) =>
                  p.user_id === user.id ? { ...p, is_muted: value } : p
                ),
              }
            : c
        )
      );

    // Optimista: refleja el cambio en la fila de mi participante al instante.
    applyMuted(muted);

    // Un UPDATE bajo RLS que no matchea ninguna fila NO devuelve error → hay que pedir
    // .select('id') y revisar que efectivamente actualizó algo, o el silencio nos engaña.
    const { data, error } = await supabase
      .from("chat_participants")
      .update({ is_muted: muted })
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .select("id");

    if (error || !data || data.length === 0) {
      applyMuted(!muted); // revertir
      toast.error(muted ? "No se pudo silenciar" : "No se pudo reactivar");
    }
  }, [user]);

  return {
    conversations,
    loading,
    profiles,
    createDirectChat,
    createGroupChat,
    deleteConversation,
    loadConversations,
    markConversationRead,
    toggleMute,
  };
}

const PAGE_SIZE = 50;

export function useMessages(
  conversationId: string | null,
  onNewMessage?: (msg: ChatMessage) => void,
  /** A quién avisarle del tecleo para que se vea en la LISTA (sidebar y
   *  nubecita). Solo conversaciones directas: en grupos se pasa [] — ver
   *  useTypingInbox. El chat abierto y la ventanita NO lo usan: van por
   *  `typing-conv-<id>`, que con un solo aviso llega a todos los miembros. */
  destinatariosDelTecleo?: string[],
) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const onNewMessageRef = useRef(onNewMessage);
  const loadMessagesRef = useRef<() => Promise<void>>();
  const optimisticIdsRef = useRef<Set<string>>(new Set());
  const [messagesRealtimeVersion, setMessagesRealtimeVersion] = useState(0);
  // Al volver del segundo plano: canal nuevo + recarga para traer lo que llegó
  // mientras el socket estaba muerto (el canal de mensajes no recarga solo).
  useReanudarAlVolver(() => {
    setMessagesRealtimeVersion((v) => v + 1);
    void loadMessagesRef.current?.();
  });
  const messagesRealtimeRetryRef = useRef(0);
  const messagesRealtimeReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref for loadOlderMessages to avoid stale closure on `messages`
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  // Id de la conversación activa AHORA — para descartar respuestas tardías de un load de una
  // conversación anterior que pisarían los mensajes del chat activo (carrera al cambiar de chat).
  const currentConvRef = useRef<string | null>(conversationId);
  currentConvRef.current = conversationId;
  onNewMessageRef.current = onNewMessage;

  // Load initial messages
  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setHasMore(true);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      // Si cambiaron de conversación mientras cargaba, descartar (no pisar el chat activo).
      if (conversationId !== currentConvRef.current) return;
      const sorted = ((data as ChatMessage[]) || []).reverse();
      setMessages(sorted);
      setHasMore((data?.length || 0) >= PAGE_SIZE);
      optimisticIdsRef.current.clear();

      // Restaurar mensajes propios NO confirmados (persistidos) para que sobrevivan a recargar.
      // Se muestran como 'failed' (reintentables); el evento 'online' los reintenta solo.
      if (user) {
        const restored: ChatMessage[] = pendingForConversation(user.id, conversationId).map((p) => ({
          id: p.optimisticId, conversation_id: p.conversationId, sender_id: user.id,
          content: p.content, type: p.type as ChatMessage["type"], file_url: p.fileUrl || null,
          file_name: p.fileName || null, file_size: null, reply_to_id: p.replyToId || null,
          album_id: p.albumId || null, is_thread_reply: !!p.isThreadReply,
          content_rich: (p.contentRich as ChatMessage["content_rich"]) ?? null,
          is_edited: false, is_deleted: false, created_at: p.createdAt, updated_at: p.createdAt,
          _localStatus: "failed",
        }));
        if (restored.length) {
          restored.forEach((m) => optimisticIdsRef.current.add(m.id));
          setMessages((prev) => {
            const have = new Set(prev.map((m) => m.id));
            return [...prev, ...restored.filter((m) => !have.has(m.id))];
          });
        }
      }

      // Backfill "entregado": al abrir la conversación, marcar como entregados los mensajes
      // de otros (los que llegaron mientras no estábamos conectados/mirando).
      if (user) {
        void markMessagesDelivered(user.id, sorted.filter(m => m.sender_id !== user.id).map(m => m.id));
      }

      // Mark as read
      if (user) {
        void cerrarNotificacionesDeChat(conversationId);
        supabase
          .from("chat_participants")
          .update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id)
          .then();
      }
    } finally {
      // Solo el load de la conversación vigente controla el spinner.
      if (conversationId === currentConvRef.current) setLoading(false);
    }
  }, [conversationId, user]);

  // Keep ref updated for use inside effects without triggering re-subscriptions
  loadMessagesRef.current = loadMessages;

  // Load older messages (infinite scroll) — uses ref to avoid re-creation
  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || loadingMore) return;
    const currentMessages = messagesRef.current;
    if (currentMessages.length === 0) return;
    
    setLoadingMore(true);
    const oldestMessage = currentMessages[0];
    
    try {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .lt("created_at", oldestMessage.created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (conversationId !== currentConvRef.current) return; // cambió de chat mientras cargaba
      if (data && data.length > 0) {
        const older = (data as ChatMessage[]).reverse();
        setMessages(prev => [...older, ...prev]);
        setHasMore(data.length >= PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, loadingMore]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Al recuperar conexión, reintentar automáticamente los mensajes fallidos.
  const retryMessageRef = useRef<((id: string) => void) | null>(null);
  useEffect(() => {
    const handleOnline = () => {
      messagesRef.current
        .filter((m) => m._localStatus === "failed")
        .forEach((m) => retryMessageRef.current?.(m.id));
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  // Realtime messages with resilient reconnection
  useEffect(() => {
    if (!conversationId || !user?.id) return;
    const userId = user.id;

    const scheduleMessagesReconnect = () => {
      if (messagesRealtimeReconnectTimerRef.current) return;

      messagesRealtimeRetryRef.current += 1;
      const delay = Math.min(1000 * Math.pow(2, messagesRealtimeRetryRef.current), 15000);

      messagesRealtimeReconnectTimerRef.current = setTimeout(() => {
        messagesRealtimeReconnectTimerRef.current = null;
        void loadMessagesRef.current?.();
        setMessagesRealtimeVersion((v) => v + 1);
      }, delay);
    };

    let cancelado = false;
    const channel = supabase
      .channel(`messages-${conversationId}-${messagesRealtimeVersion}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.find((m) => m.id === newMsg.id)) return prev;

            const optimisticMatch = prev.find(
              (m) =>
                optimisticIdsRef.current.has(m.id) &&
                m.sender_id === newMsg.sender_id &&
                m.content === newMsg.content &&
                Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 5000
            );

            if (optimisticMatch) {
              optimisticIdsRef.current.delete(optimisticMatch.id);
              return prev.map((m) => (m.id === optimisticMatch.id ? newMsg : m));
            }

            return [...prev, newMsg];
          });

          if (newMsg.sender_id !== userId) {
            onNewMessageRef.current?.(newMsg);
            if (document.hasFocus()) {
              void cerrarNotificacionesDeChat(conversationId);
              supabase
                .from("chat_participants")
                .update({ last_read_at: new Date().toISOString() })
                .eq("conversation_id", conversationId)
                .eq("user_id", userId)
                .then();
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          }
        }
      )
      .subscribe((status) => {
        if (cancelado) return;
        if (status === "SUBSCRIBED") {
          messagesRealtimeRetryRef.current = 0;
          if (messagesRealtimeReconnectTimerRef.current) {
            clearTimeout(messagesRealtimeReconnectTimerRef.current);
            messagesRealtimeReconnectTimerRef.current = null;
          }
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          scheduleMessagesReconnect();
        }
      });

    // Mark as read when window regains focus
    const handleFocus = () => {
      void cerrarNotificacionesDeChat(conversationId);
      supabase
        .from("chat_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .then();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      if (messagesRealtimeReconnectTimerRef.current) {
        clearTimeout(messagesRealtimeReconnectTimerRef.current);
        messagesRealtimeReconnectTimerRef.current = null;
      }
      cancelado = true;
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id, messagesRealtimeVersion]);

  // UN freno para las dos rutas. A 3s son 0,33 avisos/s por persona: lejísimos
  // del uno-por-tecla que cortó el socket en #1605.
  //
  // A diferencia del freno de presencia que había antes, este casi no puede
  // hacer daño si se desincroniza: al no refrescar, el aviso caduca solo por el
  // TTL del receptor. El efecto de abajo lo reinicia en cada conversación.
  const REFRESCO_TYPING_MS = 3000;
  const ultimoAvisoRef = useRef<{ valor: boolean; en: number }>({ valor: false, en: 0 });

  // ── Indicador "está escribiendo" — BROADCAST, no presencia ───────────────
  //
  // Esto era un canal de PRESENCIA (`typing-<conv>`) y fue el origen de cuatro
  // incidentes seguidos: #1603 (recrear el mismo topic mientras el viejo se
  // iba), #1605 (una publicación por tecla → Supabase corta el SOCKET ENTERO),
  // #1611 (el canal quedaba `closed` sin avisar) y #1613 (el freno se
  // desincronizaba en cada rejoin). Y aun con todo eso arreglado, en prod
  // seguía llegando tarde o directamente no llegando.
  //
  // Lo que lo decidió fue una comparación limpia: cuando la LISTA pasó a
  // broadcast (#1614) empezó a funcionar perfecto, mientras la cabecera
  // —misma pantalla, misma red, misma conversación— seguía fallando. Así que
  // la presencia se va y queda un solo mecanismo.
  //
  // Con broadcast NO hay estado de cliente que mantener sincronizado: ni
  // `track()`, ni `presenceState()`, ni un freno que pueda mentir. Llega el
  // aviso y caduca por TTL.
  //
  // ⚠️ Aun así hace falta rearmar, y por una razón que NO es la de #1611:
  // `closed` es TERMINAL en realtime-js. Su `_onClose` hace `rejoinTimer.reset()`,
  // deja `state='closed'` y saca el canal de `socket.channels`; y `_onError`
  // retorna temprano si `_isClosed()`. O sea que NADIE lo vuelve a unir, ni
  // siquiera cuando el socket reconecta (el rejoin automático cubre `errored`,
  // no `closed`). Y sin pasar callback a `subscribe()` ni nos enteraríamos: los
  // handlers que traducen a CLOSED se registran DENTRO de subscribe y solo si
  // hay callback.
  //
  // Rearmar acá sí es seguro, a diferencia de lo que costó #1603: ya no hay
  // estado de cliente que reconciliar, y como `_onClose` YA sacó el canal del
  // array, el `supabase.channel(mismo topic)` del remonte devuelve un objeto
  // NUEVO — no el zombi en `leaving` que envenenaba el topic.
  const [versionTecleo, setVersionTecleo] = useState(0);

  useEffect(() => {
    const userId = user?.id;
    if (!conversationId || !userId) return;

    // Conversación nueva: el freno arranca limpio. Sin esto, cambiar de chat
    // antes de 3s se traga el primer aviso del chat nuevo — justo el síntoma de
    // #1613, y ahora en las dos rutas a la vez porque el freno es compartido.
    ultimoAvisoRef.current = { valor: false, en: 0 };

    let cancelado = false;
    let reintento: ReturnType<typeof setTimeout> | null = null;
    const vencimientos = new Map<string, ReturnType<typeof setTimeout>>();

    const quitar = (quien: string) => {
      setTypingUsers((prev) => (prev.includes(quien) ? prev.filter((u) => u !== quien) : prev));
    };

    const canal = supabase
      .channel(topicTecleoConversacion(conversationId))
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const quien = (payload as { u?: string } | undefined)?.u;
        const escribiendo = (payload as { t?: boolean } | undefined)?.t;
        if (!quien || quien === userId) return;

        const anterior = vencimientos.get(quien);
        if (anterior) clearTimeout(anterior);
        vencimientos.delete(quien);

        if (!escribiendo) {
          quitar(quien);
          return;
        }

        setTypingUsers((prev) => (prev.includes(quien) ? prev : [...prev, quien]));
        vencimientos.set(
          quien,
          setTimeout(() => {
            vencimientos.delete(quien);
            quitar(quien);
          }, TTL_TECLEO_MS),
        );
      });

    canal.subscribe((status) => {
      if (cancelado) return;
      if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setTypingUsers([]);
        if (reintento) clearTimeout(reintento);
        reintento = setTimeout(() => {
          reintento = null;
          setVersionTecleo((v) => v + 1);
        }, 1000);
      }
    });

    return () => {
      cancelado = true;
      if (reintento) clearTimeout(reintento);
      vencimientos.forEach((t) => clearTimeout(t));
      vencimientos.clear();
      // Si me estaba anunciando como "escribiendo", avisar que ya NO antes de
      // soltar el canal. Si no, del otro lado quedo pegado hasta que venza el
      // TTL. (El caso que no cubre nadie es la pestaña que muere de golpe: ahí
      // el TTL es la única red, y son 5s como mucho.)
      if (ultimoAvisoRef.current.valor) {
        publicarTecleoEnConversacion(conversationId, userId, false);
        publicarTecleo(destinatariosRef.current, conversationId, userId, false);
        ultimoAvisoRef.current = { valor: false, en: 0 };
      }
      supabase.removeChannel(canal);
      setTypingUsers([]);
    };
  }, [conversationId, user?.id, versionTecleo]);

  // Envío real, compartido por sendMessage y el reintento. Marca 'sending'; en éxito reemplaza
  // el optimista por la fila real (o lo quita si el realtime ya lo insertó) y limpia la cola
  // persistente; en offline/error deja el mensaje como 'failed' (queda persistido → reintentable).
  const performSend = useCallback(
    async (p: {
      optimisticId: string; conversationId: string; content: string;
      type: ChatMessage["type"]; fileUrl?: string; fileName?: string; replyToId?: string;
      albumId?: string; isThreadReply?: boolean; contentRich?: unknown;
    }) => {
      if (!user) return;
      setMessages((prev) => prev.map((m) => (m.id === p.optimisticId ? { ...m, _localStatus: "sending" } : m)));

      if (!navigator.onLine) {
        setMessages((prev) => prev.map((m) => (m.id === p.optimisticId ? { ...m, _localStatus: "failed" } : m)));
        return;
      }

      const { data, error } = await supabase.from("chat_messages").insert({
        conversation_id: p.conversationId,
        sender_id: user.id,
        content: p.content,
        type: p.type,
        file_url: p.fileUrl || null,
        file_name: p.fileName || null,
        reply_to_id: p.replyToId || null,
        album_id: p.albumId || null,
        is_thread_reply: !!p.isThreadReply,
        content_rich: (p.contentRich ?? null) as never,
      }).select().single();

      if (error || !data) {
        setMessages((prev) => prev.map((m) => (m.id === p.optimisticId ? { ...m, _localStatus: "failed" } : m)));
        return;
      }

      optimisticIdsRef.current.delete(p.optimisticId);
      removePending(user.id, p.optimisticId);
      const real = data as ChatMessage;
      setMessages((prev) =>
        prev.some((m) => m.id === real.id)
          ? prev.filter((m) => m.id !== p.optimisticId)   // el realtime ya lo insertó → sin duplicar
          : prev.map((m) => (m.id === p.optimisticId ? real : m))
      );
      supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", p.conversationId).then();
    },
    [user]
  );

  const sendMessage = useCallback(
    async (
      content: string,
      type: ChatMessage["type"] = "text",
      fileUrl?: string,
      fileName?: string,
      replyToId?: string,
      albumId?: string,
      isThreadReply?: boolean,
      contentRich?: unknown
    ) => {
      if (!conversationId || !user) return;
      const optimisticId = crypto.randomUUID();
      const now = new Date().toISOString();
      optimisticIdsRef.current.add(optimisticId);
      const optimisticMsg: ChatMessage = {
        id: optimisticId, conversation_id: conversationId, sender_id: user.id,
        content, type, file_url: fileUrl || null, file_name: fileName || null, file_size: null,
        reply_to_id: replyToId || null, album_id: albumId || null, is_thread_reply: !!isThreadReply,
        content_rich: (contentRich as ChatMessage["content_rich"]) ?? null,
        is_edited: false, is_deleted: false,
        created_at: now, updated_at: now, _localStatus: "sending",
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      // Persistir ANTES de intentar: si no se confirma (offline/error/recarga), sobrevive.
      addPending(user.id, { optimisticId, conversationId, content, type, fileUrl, fileName, replyToId, albumId, isThreadReply, contentRich, createdAt: now });
      await performSend({ optimisticId, conversationId, content, type, fileUrl, fileName, replyToId, albumId, isThreadReply, contentRich });
    },
    [conversationId, user, performSend]
  );

  // Reintentar un mensaje fallido (botón manual o al recuperar conexión). Reconstruye el
  // payload desde el mensaje en estado (robusto aunque localStorage no esté disponible).
  const retryMessage = useCallback(
    (optimisticId: string) => {
      const m = messagesRef.current.find((x) => x.id === optimisticId);
      if (!m || !user) return;
      const payload = {
        optimisticId, conversationId: m.conversation_id, content: m.content || "",
        type: m.type, fileUrl: m.file_url || undefined, fileName: m.file_name || undefined,
        replyToId: m.reply_to_id || undefined, albumId: m.album_id || undefined,
        isThreadReply: m.is_thread_reply || undefined,
      };
      addPending(user.id, { ...payload, createdAt: m.created_at });
      void performSend(payload);
    },
    [user, performSend]
  );
  retryMessageRef.current = retryMessage;

  // ⚠️⚠️ FRENO OBLIGATORIO. NO publicar presencia por cada cambio.
  //
  // Esto mandaba un `track()` POR CADA TECLA. Supabase corta al cliente que se
  // pasa de mensajes de presencia y le corta EL SOCKET ENTERO —no solo este
  // canal— y el aviso nunca llega al navegador: `ClientPresenceRateLimitReached`
  // en los realtime_logs, ~110 por hora en la hora pico del 04/09. Por eso el
  // "está escribiendo" andaba un momento y después se moría, y por eso el canal
  // aparecía cerrado sin explicación. Mismo incidente que dejó ciego al tablero
  // de Cowork en agosto.
  //
  // La presencia es CON ESTADO: una vez anunciado `typing:true` queda así hasta
  // que se anuncie `false`. O sea que un tecleo entero necesita exactamente DOS
  // mensajes, no uno por letra. Solo se publica cuando el valor CAMBIA.
  //
  // El refresco cada 8s es la única concesión: si un `track` se perdiera, el
  // otro lado se quedaría viendo "escribiendo" para siempre (o nada). Es como
  // mucho un mensaje cada 8 segundos, muy por debajo de cualquier límite.
  // A quién avisarle, en un ref: cambia con cada render de la página, y meterlo
  // en las deps recrearía sendTyping y con él handleComposerUpdate en cada
  // pintada.
  const destinatariosRef = useRef<string[]>([]);
  destinatariosRef.current = destinatariosDelTecleo ?? [];

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      const userId = user?.id;
      if (!conversationId || !userId) return;

      const ahora = Date.now();
      const ultimo = ultimoAvisoRef.current;
      if (ultimo.valor === isTyping && ahora - ultimo.en < REFRESCO_TYPING_MS) return;
      ultimoAvisoRef.current = { valor: isTyping, en: ahora };

      // A quien tenga ABIERTA la conversación (cabecera y ventanita del muelle):
      // un solo aviso, y sirve igual para un grupo de treinta.
      publicarTecleoEnConversacion(conversationId, userId, isTyping);
      // A los BUZONES de cada persona (lista lateral y nubecita): solo DMs.
      publicarTecleo(destinatariosRef.current, conversationId, userId, isTyping);
    },
    [conversationId, user?.id]
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      // Si el mensaje todavía se está enviando (id optimista), el UPDATE no matchearía
      // ninguna fila real y la edición se perdería en silencio → bloquear hasta que persista.
      if (optimisticIdsRef.current.has(messageId)) {
        toast.info("Espera a que el mensaje termine de enviarse");
        return;
      }
      // Optimistic update
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent, is_edited: true } : m));
      const { error } = await supabase
        .from("chat_messages")
        .update({ content: newContent, is_edited: true })
        .eq("id", messageId);
      if (error) {
        toast.error("Error al editar mensaje");
        void loadMessagesRef.current?.();
      }
    },
    []
  );

  const deleteMessage = useCallback(async (messageId: string) => {
    // Mensaje LOCAL no confirmado (sending/failed): no existe en la BD → descartarlo local
    // y quitarlo de la cola persistente (permite descartar un fallido que no quieres reintentar).
    const local = messagesRef.current.find((m) => m.id === messageId);
    if (local?._localStatus) {
      optimisticIdsRef.current.delete(messageId);
      if (user) removePending(user.id, messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      return;
    }
    // Igual que editMessage: si el id es optimista (aún enviándose), el UPDATE no
    // matchearía nada y el borrado se perdería en silencio → bloquear hasta que persista.
    if (optimisticIdsRef.current.has(messageId)) {
      toast.info("Espera a que el mensaje termine de enviarse");
      return;
    }
    // Optimistic soft delete (también el adjunto: la RPC vacía content y file_url)
    setMessages(prev => prev.map(m => m.id === messageId
      ? { ...m, is_deleted: true, content: null, file_url: null, file_name: null }
      : m));
    // El borrado va por RPC: archiva el original en chat_message_deletions
    // (solo-admin por RLS) y RECIÉN ahí vacía el mensaje visible, así el
    // contenido eliminado no queda legible para los no-admin.
    const { data, error } = await supabase.rpc("delete_chat_message" as never, { p_message_id: messageId } as never);
    const res = data as unknown as { ok?: boolean } | null;
    if (error || (res && res.ok === false)) {
      toast.error("Error al eliminar mensaje");
      void loadMessagesRef.current?.();
    }
  }, [user]);

  return {
    messages,
    loading,
    hasMore,
    loadingMore,
    loadOlderMessages,
    typingUsers,
    sendMessage,
    sendTyping,
    editMessage,
    deleteMessage,
    retryMessage,
  };
}

// Re-export from useReadReceipts.ts for backward compatibility
export { useReadReceipts } from "@/hooks/useReadReceipts";
