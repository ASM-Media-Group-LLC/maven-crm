import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ChatSidebar from "./ChatSidebar";
import ChatView from "./ChatView";
import NewChatModal from "./NewChatModal";

import DeleteChatDialog from "./components/DeleteChatDialog";
import { ConversationWithDetails, ChatMessage } from "./types";
import { useChatShared } from "@/hooks/ChatProvider";
import { useMessages } from "@/hooks/useChat";
import { useReactions } from "@/hooks/useReactions";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { useAuth } from "@/hooks/useAuth";
import { useCall } from "@/components/CallProvider";
import { usePinnedChats } from "@/hooks/usePinnedChats";
import { useArchivedChats } from "@/hooks/useArchivedChats";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";

function openCallInNewTab(roomName: string, isAdmin: boolean, displayName?: string) {
  const params = new URLSearchParams();
  if (isAdmin) params.set("admin", "1");
  if (displayName) params.set("name", displayName);
  const qs = params.toString();
  const url = `/call/${encodeURIComponent(roomName)}${qs ? `?${qs}` : ""}`;
  const target = `call-${roomName}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  window.open(url, target, "noopener");
}

/** Solo rutas internas: "/algo". Corta "//host", "http…" y cualquier absoluta. */
const rutaInterna = (r: string | null): boolean => !!r && /^\/[A-Za-z0-9\-_/]*(\?[^#]*)?$/.test(r) && !r.startsWith("//");

export default function MessengerPage() {
  const { conversations, loading, profiles, createDirectChat, createGroupChat, deleteConversation, loadConversations, markConversationRead, toggleMute } = useChatShared();
  const { isOnline, onlineUsers, getStatus } = useOnlinePresence();
  const { user } = useAuth();
  const { initiateCall } = useCall();
  const { isPinned, togglePin, pinnedOrder, reorderPinned } = usePinnedChats();
  const { isArchived, toggleArchive } = useArchivedChats();
  const { isAdmin: isSystemAdmin } = useUserRole();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConversationWithDetails | null>(null);
  const [deleting, setDeleting] = useState(false);

  const joinedFromLinkRef = useRef(false);

  const selectChat = useCallback((chatId: string | null) => {
    setActiveChatId(chatId);
    activeChatIdRef.current = chatId;
    if (chatId) markConversationRead(chatId);
  }, [markConversationRead]);

  // Abrir una conversación al llegar desde una notificación (/messenger?c=<id>): en cuanto
  // la conversación esté cargada, la seleccionamos y limpiamos el parámetro.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // `?c=` es el parámetro; `?chat=` es un alias que hay que aceptar: el trigger
  // notify_chat_message escribió '/messenger?chat=<id>' en el deep_link_url de
  // 86.254 notificaciones (30 días) y nadie lo leía, así que el clic en una
  // notificación de Messenger aterrizaba acá sin abrir el chat (Jhon, 15/09).
  // El trigger ya escribe ?c=, pero las filas viejas siguen en la campana.
  // `?m=` es el mensaje concreto: una mención dentro de un hilo abre el hilo
  // (María, 16/09: "me abrió el grupo pero no me llevó al hilo").
  const [mensajeDestino, setMensajeDestino] = useState<string | null>(null);
  const saltoHecho = useCallback(() => setMensajeDestino(null), []);
  useEffect(() => {
    const c = searchParams.get("c") ?? searchParams.get("chat");
    const m = searchParams.get("m");
    if (!c) return;
    if (conversations.some((x) => x.id === c)) {
      selectChat(c);
      if (m) setMensajeDestino(m);
      searchParams.delete("c");
      searchParams.delete("chat");
      searchParams.delete("m");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, conversations, selectChat, setSearchParams]);

  // Abrir el modal de "Mensaje nuevo" al llegar desde el desplegable de mensajes
  // del topbar (/messenger?nuevo=1).
  useEffect(() => {
    if (!searchParams.get("nuevo")) return;
    setNewChatOpen(true);
    searchParams.delete("nuevo");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const activeConv = conversations.find(c => c.id === activeChatId) || null;

  const handleNewMessage = useCallback((msg: ChatMessage) => {
    // El sonido + notificación del navegador los maneja el hook global
    // useMessengerNotifications (montado en AppShell), para que funcionen en toda Maven y
    // respeten el silenciado por conversación. Acá sólo marcamos leída la conversación
    // activa cuando llega un mensaje mientras la estamos mirando.
    // Solo marcar leído si además la ventana está ENFOCADA: si llega un mensaje al chat
    // abierto mientras estás en otra pestaña/app, no lo des por visto (el badge/menciones
    // seguirían encendidos hasta que vuelvas — el listener de focus de useMessages hace el
    // catch-up al volver).
    if (document.hasFocus() && activeChatIdRef.current === msg.conversation_id) {
      markConversationRead(msg.conversation_id);
    }
  }, [markConversationRead]);

  // A quién avisarle del tecleo para que se vea en la LISTA. Solo DMs: en un
  // grupo serían N POST por persona que teclea, y no vale el fan-out.
  const destinatariosDelTecleo = useMemo(
    () =>
      activeConv?.type === "direct"
        ? activeConv.participants.map((p) => p.user_id).filter((id) => id !== user?.id)
        : [],
    [activeConv, user?.id],
  );

  const {
    messages, loading: msgsLoading, typingUsers,
    sendMessage, sendTyping, editMessage, deleteMessage, retryMessage,
    hasMore, loadingMore, loadOlderMessages, traerMensaje,
  } = useMessages(activeChatId, handleNewMessage, destinatariosDelTecleo);

  const { toggleReaction, getReactionsForMessage, addMessageId } = useReactions(activeChatId);

  useEffect(() => { messages.forEach((m) => addMessageId(m.id)); }, [messages, addMessageId]);
  const { getReadBy, getDeliveredBy } = useReadReceipts(activeChatId, messages);

  const handleSelectUser = useCallback((userId: string) => {
    // onResolved: si el DM ya existía en el server, reapuntamos la selección al id real
    // (evita quedar en una conv optimista que se elimina bajo el usuario).
    const convId = createDirectChat(userId, (realId) => selectChat(realId));
    if (convId) selectChat(convId);
  }, [createDirectChat, selectChat]);

  // Abrir (o crear) un DM al llegar desde el ⌘K (/messenger?dm=<userId>).
  // Espera a que las conversaciones carguen para reutilizar el DM existente,
  // y limpia el parámetro para que un back/refresh no lo re-dispare.
  // Si el DM se abrió desde una MENCIÓN (`&from=<convId>`), se recuerda el
  // grupo de origen para ofrecer "volver" en el header del DM. Se limpia al
  // elegir cualquier chat desde la lista: el salto-y-vuelta es solo para el
  // viaje que empezó en la mención.
  const [volverA, setVolverA] = useState<string | null>(null);
  // Cuando el DM se abre desde OTRA pantalla de Maven (?back=/personalizados
  // &backName=Personalizados), el back del header devuelve a esa pantalla.
  // Solo se aceptan rutas internas: nada de "//host" ni URLs absolutas.
  const [volverAPagina, setVolverAPagina] = useState<{ ruta: string; nombre: string } | null>(null);
  useEffect(() => {
    const dm = searchParams.get("dm");
    if (!dm || loading) return;
    const from = searchParams.get("from");
    const back = searchParams.get("back");
    const backName = searchParams.get("backName");
    searchParams.delete("dm");
    searchParams.delete("from");
    searchParams.delete("back");
    searchParams.delete("backName");
    setSearchParams(searchParams, { replace: true });
    setVolverA(from && conversations.some((c) => c.id === from) ? from : null);
    setVolverAPagina(rutaInterna(back) ? { ruta: back!, nombre: (backName || "atrás").slice(0, 40) } : null);
    handleSelectUser(dm);
  }, [searchParams, loading, handleSelectUser, setSearchParams, conversations]);

  const grupoDeOrigen = volverA ? conversations.find((c) => c.id === volverA) ?? null : null;
  const returnTo = grupoDeOrigen
    ? { name: grupoDeOrigen.displayName, onBack: () => { const id = grupoDeOrigen.id; setVolverA(null); selectChat(id); } }
    : volverAPagina
      ? { name: volverAPagina.nombre, onBack: () => { const r = volverAPagina.ruta; setVolverAPagina(null); navigate(r); } }
      : null;

  const handleCreateGroup = (name: string, memberIds: string[]) => {
    const convId = createGroupChat(name, memberIds);
    if (convId) selectChat(convId);
    setNewGroupOpen(false);
  };

  const handleStartVideoCall = async (conv: ConversationWithDetails) => {
    // 1-a-1: llamada estilo WhatsApp — al otro le SUENA y aparece el modal para
    // aceptar o rechazar, esté en la sección de Maven que esté. Se detecta por
    // `type === "direct"` (confiable), NO por participants.length: esa lista
    // viene con un límite global que los grupos grandes agotan, así que a
    // algunos DMs les llega incompleta (por eso antes caía al link).
    if (conv.type === "direct") {
      let otroId = conv.participants.find((p) => p.user_id !== user?.id)?.user_id;
      // Si no vino en la lista (incompleta), se resuelve contra la DB.
      if (!otroId && user?.id) {
        const { data } = await supabase
          .from("chat_participants")
          .select("user_id")
          .eq("conversation_id", conv.id)
          .neq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        otroId = (data?.user_id as string) ?? undefined;
      }
      if (otroId) {
        // `initiateCall` crea el "ringing" (dispara el modal por realtime + el
        // push) y abre la sala.
        await initiateCall(conv.id, otroId, conv.displayName, "video");
        return;
      }
    }
    // Grupo (o no se pudo resolver el otro) → se comparte el link. Hacer sonar
    // a varios a la vez es otra vuelta (la tabla `calls` tiene un solo receiver).
    const roomName = `call-${conv.id}`;
    openCallInNewTab(roomName, true, conv.displayName);
    const callLink = `${window.location.origin}/call/${encodeURIComponent(roomName)}`;
    await sendMessage(`📹 Videollamada iniciada\n${callLink}`, "text");
  };

  const handleDeleteChat = async (chatId: string) => {
    const success = await deleteConversation(chatId);
    if (success && activeChatId === chatId) selectChat(null);
    return success;
  };

  // Borrar desde el header del chat SIEMPRE pasa por confirmación (antes borraba directo,
  // sin diálogo — irreversible con un solo click).
  const handleConfirmDeleteActive = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await handleDeleteChat(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
  };

  useEffect(() => {
    const chatParam = new URLSearchParams(window.location.search).get("chat");
    if (chatParam && !activeChatId) {
      selectChat(chatParam);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [activeChatId]);

  useEffect(() => {
    if (joinedFromLinkRef.current) return;
    const roomParam = new URLSearchParams(window.location.search).get("room");
    if (!roomParam) return;
    const roomName = decodeURIComponent(roomParam).trim();
    if (!roomName) return;
    openCallInNewTab(roomName, false);
    joinedFromLinkRef.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    toast.success("Abriendo sala en nueva pestaña...");
  }, []);

  return (
    <div className="h-full flex overflow-hidden bg-background">
      {/* Sidebar. El corte lista→chat es `md` (768), el MISMO umbral de useIsMobile
          y del Sheet del sidebar: con `sm` (640), entre 640 y 767 px se veían dos
          columnas de 280 px con el menú ya en modo teléfono. */}
      <div className={cn(
        "w-full md:w-[320px] lg:w-[340px] shrink-0 transition-all",
        activeChatId ? "hidden md:flex md:flex-col" : "flex flex-col"
      )}>
        <ChatSidebar
          conversations={conversations}
          activeChatId={activeChatId}
          onSelectChat={(id) => { setVolverA(null); selectChat(id); }}
          onNewChat={() => setNewChatOpen(true)}
          onNewGroup={() => setNewGroupOpen(true)}
          onSelectContact={handleSelectUser}
          onDeleteChat={handleDeleteChat}
          loading={loading}
          profiles={profiles}
          isPinned={isPinned}
          onTogglePin={togglePin}
          pinnedOrder={pinnedOrder}
          onReorderPinned={reorderPinned}
          isArchived={isArchived}
          onToggleArchive={toggleArchive}
          onToggleMute={toggleMute}
        />
      </div>

      {/* Chat view */}
      <div className={cn(
        "flex-1 min-w-0",
        !activeChatId ? "hidden md:flex" : "flex"
      )}>
        {activeConv ? (
          // ⚠️ `min-w-0` NO es decorativo. Sin él, este hijo flex se niega a
          // encogerse por debajo del ancho de su contenido: un texto largo sin
          // espacios en el cajón hacía crecer el div, salirse de la columna y
          // —al ir después en el DOM— dibujarse ENCIMA de la barra lateral en
          // vez de bajar a un segundo renglón. La ventanita flotante del muelle
          // no lo sufría porque ella sí recorta con overflow-hidden.
          <div className="flex-1 min-w-0">
            {/* key por conversación: remonta ChatView al cambiar de chat para que el borrador,
                la cita (replyTo) y el hilo abierto NO se fuguen a la conversación equivocada. */}
            <ChatView
              key={activeConv.id}
              conversation={activeConv}
              messages={messages}
              profiles={profiles}
              typingUsers={typingUsers}
              onSendMessage={sendMessage}
              onSendTyping={sendTyping}
              onEditMessage={editMessage}
              onDeleteMessage={deleteMessage}
              onRetryMessage={retryMessage}
              onBack={() => selectChat(null)}
              onStartVideoCall={handleStartVideoCall}
              loading={msgsLoading}
              getReactionsForMessage={getReactionsForMessage}
              onToggleReaction={toggleReaction}
              getReadByUsers={getReadBy}
              getDeliveredByUsers={getDeliveredBy}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadOlderMessages}
              saltarA={mensajeDestino}
              onSaltoHecho={saltoHecho}
              traerMensaje={traerMensaje}
              onMembersChanged={loadConversations}
              isPinned={isPinned(activeConv.id)}
              onTogglePin={() => togglePin(activeConv.id)}
              onArchive={() => { toggleArchive(activeConv.id); selectChat(null); }}
              onDelete={() => setDeleteTarget(activeConv)}
              canDelete={isSystemAdmin || activeConv.type !== "group" || activeConv.participants.some(p => p.user_id === user?.id && p.role === "admin")}
              returnTo={returnTo}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-primary/[0.02]">
            <EmptyState
              seed="empty-messenger"
              title="Ninguna conversación abierta"
              description="Selecciona un chat o contacto para comenzar a conversar"
            />
          </div>
        )}
      </div>

      {/* El modal de llamada entrante ahora es GLOBAL (CallProvider), para que
          suene estés en la sección de Maven que estés, no solo acá. */}

      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        profiles={profiles}
        onSelectUser={(userId) => { handleSelectUser(userId); setNewChatOpen(false); }}
        isOnlineFn={isOnline}
        getStatusFn={getStatus}
      />

      <NewChatModal
        open={newGroupOpen}
        onClose={() => setNewGroupOpen(false)}
        profiles={profiles}
        onSelectUser={() => {}}
        isGroup
        onCreateGroup={handleCreateGroup}
        isOnlineFn={isOnline}
        getStatusFn={getStatus}
      />

      <DeleteChatDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        chatName={deleteTarget?.displayName || ""}
        isGroup={deleteTarget?.type === "group"}
        onConfirm={handleConfirmDeleteActive}
        isLoading={deleting}
      />
    </div>
  );
}
