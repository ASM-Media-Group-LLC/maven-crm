import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import ChatSidebar from "./ChatSidebar";
import ChatView from "./ChatView";
import VideoRoomsPanel from "./VideoRoomsPanel";
import NewChatModal from "./NewChatModal";

import IncomingCallModal from "./components/IncomingCallModal";
import DeleteChatDialog from "./components/DeleteChatDialog";
import { ConversationWithDetails, ChatMessage } from "./types";
import { useChat, useMessages } from "@/hooks/useChat";
import { useReactions } from "@/hooks/useReactions";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { useNotificationPermission } from "@/hooks/useBrowserNotifications";
import { useAuth } from "@/hooks/useAuth";
import { useVideoCall } from "@/hooks/useVideoCall";
import { useSpaces } from "@/hooks/useSpaces";
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

export default function MessengerPage() {
  const { conversations, loading, profiles, createDirectChat, createGroupChat, deleteConversation, loadConversations, markConversationRead, toggleMute } = useChat();
  const { isOnline, onlineUsers, getStatus } = useOnlinePresence();
  const { user } = useAuth();
  useNotificationPermission();
  const { incomingCall, acceptCall, declineCall } = useVideoCall();
  const { spaces, createSpace, deleteSpace, renameSpace, addConversationToSpace, removeConversationFromSpace } = useSpaces();
  const { isPinned, togglePin } = usePinnedChats();
  const { isArchived, toggleArchive } = useArchivedChats();
  const { isAdmin: isSystemAdmin } = useUserRole();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const [showVideoRooms, setShowVideoRooms] = useState(false);
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
  useEffect(() => {
    const c = searchParams.get("c");
    if (!c) return;
    if (conversations.some((x) => x.id === c)) {
      selectChat(c);
      searchParams.delete("c");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, conversations, selectChat, setSearchParams]);

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

  const {
    messages, loading: msgsLoading, typingUsers,
    sendMessage, sendTyping, editMessage, deleteMessage,
    hasMore, loadingMore, loadOlderMessages,
  } = useMessages(activeChatId, handleNewMessage);

  const { toggleReaction, getReactionsForMessage, addMessageId } = useReactions(activeChatId);

  useEffect(() => { messages.forEach((m) => addMessageId(m.id)); }, [messages, addMessageId]);
  const messageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { getReadBy, getDeliveredBy } = useReadReceipts(activeChatId, messageIds);

  const handleSelectUser = useCallback((userId: string) => {
    // onResolved: si el DM ya existía en el server, reapuntamos la selección al id real
    // (evita quedar en una conv optimista que se elimina bajo el usuario).
    const convId = createDirectChat(userId, (realId) => selectChat(realId));
    if (convId) selectChat(convId);
  }, [createDirectChat, selectChat]);

  const handleCreateGroup = (name: string, memberIds: string[]) => {
    const convId = createGroupChat(name, memberIds);
    if (convId) selectChat(convId);
    setNewGroupOpen(false);
  };

  const handleStartVideoCall = async (conv: ConversationWithDetails) => {
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
      {/* Sidebar */}
      <div className={cn(
        "w-full sm:w-[280px] md:w-[320px] lg:w-[340px] shrink-0 transition-all",
        activeChatId ? "hidden sm:flex sm:flex-col" : "flex flex-col"
      )}>
        {showVideoRooms ? (
          <VideoRoomsPanel onClose={() => setShowVideoRooms(false)} />
        ) : (
            <ChatSidebar
              conversations={conversations}
              activeChatId={activeChatId}
              onSelectChat={selectChat}
              onNewChat={() => setNewChatOpen(true)}
              onNewGroup={() => setNewGroupOpen(true)}
              onOpenVideoRooms={() => setShowVideoRooms(true)}
              onSelectContact={handleSelectUser}
              onDeleteChat={handleDeleteChat}
              loading={loading}
              profiles={profiles}
              isPinned={isPinned}
              onTogglePin={togglePin}
              isArchived={isArchived}
              onToggleArchive={toggleArchive}
              onToggleMute={toggleMute}
              spaces={spaces}
              onCreateSpace={createSpace}
              onDeleteSpace={deleteSpace}
              onRenameSpace={renameSpace}
              onAddConversationToSpace={addConversationToSpace}
              onRemoveConversationFromSpace={removeConversationFromSpace}
            />
        )}
      </div>

      {/* Chat view */}
      <div className={cn(
        "flex-1 min-w-0",
        !activeChatId ? "hidden sm:flex" : "flex"
      )}>
        {activeConv ? (
          <div className="flex-1">
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
              onMembersChanged={loadConversations}
              isPinned={isPinned(activeConv.id)}
              onTogglePin={() => togglePin(activeConv.id)}
              onArchive={() => { toggleArchive(activeConv.id); selectChat(null); }}
              onDelete={() => setDeleteTarget(activeConv)}
              canDelete={isSystemAdmin || activeConv.type !== "group" || activeConv.participants.some(p => p.user_id === user?.id && p.role === "admin")}
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

      {incomingCall && (
        <IncomingCallModal
          call={incomingCall}
          onAccept={acceptCall}
          onDecline={declineCall}
        />
      )}

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
