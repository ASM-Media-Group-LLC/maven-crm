import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ConversationWithDetails, ChatMessage, UserProfile } from "./types";
import { ReactionGroup } from "@/hooks/useReactions";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import ChatHeader from "./components/ChatHeader";
import MessageList from "./components/MessageList";
import TypingBubble from "./components/TypingBubble";
import { ProgramadosDelChat, useProgramarEnChat } from "./components/ProgramadosDelChat";
import MessageInput, { MessageInputHandle } from "./components/MessageInput";
import ThreadPanel from "./components/ThreadPanel";
import SearchResultsPanel from "./components/SearchResultsPanel";
import NotificationSettings from "./components/NotificationSettings";
import SharedFilesGallery from "./components/SharedFilesGallery";
import GroupMembersPanel from "./components/GroupMembersPanel";
import ProfileCard from "./components/ProfileCard";
import { useDeletedMessages } from "./useDeletedMessages";
import { puedeVerLaListaDeMiembros } from "./utils";
import { Upload, Megaphone } from "lucide-react";

interface ChatViewProps {
  conversation: ConversationWithDetails;
  messages: ChatMessage[];
  profiles: Record<string, UserProfile>;
  typingUsers: string[];
  onSendMessage: (content: string, type?: ChatMessage["type"], fileUrl?: string, fileName?: string, replyToId?: string, albumId?: string, isThreadReply?: boolean, contentRich?: unknown) => void;
  onSendTyping: (isTyping: boolean) => void;
  onEditMessage: (id: string, content: string) => void;
  onDeleteMessage: (id: string) => void;
  onRetryMessage?: (id: string) => void;
  onBack: () => void;
  onStartVideoCall: (conv: ConversationWithDetails, tipo?: "audio" | "video") => void;
  loading: boolean;
  getReactionsForMessage: (messageId: string) => ReactionGroup[];
  onToggleReaction: (messageId: string, emoji: string) => void;
  getReadByUsers: (messageId: string) => string[];
  getDeliveredByUsers: (messageId: string) => string[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** Mensaje al que hay que saltar (?m= de una notificación). Si es una
   *  respuesta de hilo, se abre el hilo de su padre y se resalta ahí. */
  saltarA?: string | null;
  onSaltoHecho?: () => void;
  /** Trae un mensaje por id cuando no está en la ventana cargada. */
  traerMensaje?: (id: string) => Promise<ChatMessage | null>;
  onMembersChanged?: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  returnTo?: { name: string; onBack: () => void } | null;
}

export default function ChatView({
  conversation, messages, profiles, typingUsers, onSendMessage, onSendTyping,
  onEditMessage, onDeleteMessage, onRetryMessage, onBack, onStartVideoCall, loading,
  getReactionsForMessage, onToggleReaction, getReadByUsers, getDeliveredByUsers,
  hasMore, loadingMore, onLoadMore, onMembersChanged,
  saltarA, onSaltoHecho, traerMensaje,
  isPinned, onTogglePin, onArchive, onDelete, canDelete, returnTo,
}: ChatViewProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  // Grupo "anuncios": solo admins escriben. Un no-admin ve un aviso en vez del composer.
  const amAdmin = conversation.participants.find(p => p.user_id === user?.id)?.role === "admin";
  const announcementLocked = conversation.type === "group" && conversation.msg_permission === "admins" && !amAdmin;
  // Lista de miembros oculta: el buscador de @ no enseña a nadie hasta que se
  // teclean 2 letras, así se puede mencionar sin poder pasear el roster.
  const mencionesACiegas = !puedeVerLaListaDeMiembros(conversation, user?.id);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  // La respuesta de hilo a resaltar cuando llegamos desde una notificación.
  const [respuestaResaltada, setRespuestaResaltada] = useState<string | null>(null);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showSharedFiles, setShowSharedFiles] = useState(false);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const messageInputRef = useRef<MessageInputHandle>(null);
  // «Programar envío» (como Google Chat): la flechita del cajón.
  const programarEnChat = useProgramarEnChat(conversation.id);

  const closeSidePanels = useCallback((except?: "search" | "thread" | "files" | "members") => {
    if (except !== "search") { setSearchOpen(false); setSearchQuery(""); }
    if (except !== "thread") setThreadParent(null);
    if (except !== "files") setShowSharedFiles(false);
    if (except !== "members") setShowGroupMembers(false);
    if (except !== "search") setHighlightedMsgId(null);
  }, []);

  // El timeline principal esconde las respuestas de HILO: viven solo en su panel.
  // Se filtra por el flag is_thread_reply de la DB (lo estampa el que envía desde
  // el panel), NO por heurística sobre reply_to_id: eso ya se intentó y se
  // revirtió — dependía de si el padre estaba en la ventana paginada (PAGE_SIZE=50)
  // y los mensajes aparecían/desaparecían al hacer scroll. Las citas ("Responder")
  // tienen el flag en false y se ven inline como siempre. Los mensajes de hilo
  // HISTÓRICOS (anteriores al flag) quedan en false y siguen visibles: no hay
  // forma retroactiva de distinguirlos de una cita.
  const mainMessages = useMemo(() => messages.filter(m => !m.is_thread_reply), [messages]);

  // Contenido original de los mensajes eliminados. `chat_message_deletions` es
  // solo-admin por RLS: a un usuario normal esto llega VACÍO desde el servidor
  // (no es un esconder en la UI) y se pinta "Eliminado por el autor".
  const deletedIds = useMemo(() => messages.filter((m) => m.is_deleted).map((m) => m.id), [messages]);
  const deletedArchive = useDeletedMessages(deletedIds);

  // Un hilo lo forman SOLO los mensajes enviados desde el panel del hilo
  // (is_thread_reply). Una cita de "Responder" también lleva reply_to_id, pero es
  // otra cosa: se ve inline en el timeline y no abre ningún hilo. Sin este filtro,
  // responder a alguien le colgaba un "1 respuesta" al mensaje citado y aparecía
  // un hilo que nadie pidió. Medido en prod el 05/09: de 445 mensajes con
  // reply_to_id, 231 son hilos de verdad y 214 son citas inline.
  const esDelHilo = useCallback(
    (m: ChatMessage, parentId: string) => m.reply_to_id === parentId && !!m.is_thread_reply,
    []
  );

  const threadReplies = useMemo(() => {
    if (!threadParent) return [];
    return messages.filter(m => esDelHilo(m, threadParent.id));
  }, [threadParent, messages, esDelHilo]);

  const handleSendThreadReply = useCallback((content: string, type?: ChatMessage["type"], fileUrl?: string, fileName?: string) => {
    if (!threadParent) return;
    // isThreadReply=true: el mensaje vive SOLO dentro del hilo (el timeline lo esconde).
    onSendMessage(content, type || "text", fileUrl, fileName, threadParent.id, undefined, true);
  }, [threadParent, onSendMessage]);

  const getThreadCount = useCallback((messageId: string) => {
    return messages.filter(m => esDelHilo(m, messageId)).length;
  }, [messages, esDelHilo]);

  const [seenThreadCounts, setSeenThreadCounts] = useState<Record<string, number>>({});

  const getUnreadThreadCount = useCallback((messageId: string) => {
    const total = messages.filter(m => esDelHilo(m, messageId)).length;
    const seen = seenThreadCounts[messageId] || 0;
    return Math.max(0, total - seen);
  }, [messages, seenThreadCounts, esDelHilo]);

  const handleOpenThreadWithTracking = useCallback((msg: ChatMessage) => {
    const parentId = msg.reply_to_id
      ? (messages.find(m => m.id === msg.reply_to_id) ? msg.reply_to_id : msg.id)
      : msg.id;
    const count = messages.filter(m => esDelHilo(m, parentId)).length;
    setSeenThreadCounts(prev => ({ ...prev, [parentId]: count }));

    closeSidePanels("thread");
    if (msg.reply_to_id) {
      const parent = messages.find(m => m.id === msg.reply_to_id);
      if (parent) { setThreadParent(parent); return; }
    }
    setThreadParent(msg);
  }, [messages, closeSidePanels, esDelHilo]);

  const handleSearchResultClick = useCallback((messageId: string) => {
    setHighlightedMsgId(messageId);
  }, []);

  // Clic en una cita: al mensaje original, resaltado un momento. Se limpia
  // antes para que volver a tocar la MISMA cita también lleve (el efecto que
  // hace el scroll solo corre cuando el id cambia).
  const quitarResaltadoRef = useRef<number | undefined>(undefined);
  const irAlMensajeCitado = useCallback((messageId: string) => {
    window.clearTimeout(quitarResaltadoRef.current);
    setHighlightedMsgId(null);
    requestAnimationFrame(() => setHighlightedMsgId(messageId));
    quitarResaltadoRef.current = window.setTimeout(
      () => setHighlightedMsgId((actual) => (actual === messageId ? null : actual)), 2500);
  }, []);
  useEffect(() => () => window.clearTimeout(quitarResaltadoRef.current), []);

  // SALTAR A UN MENSAJE (?m= de una notificación). María (16/09): "me abrió el
  // grupo pero no me llevó al hilo". Si el mensaje es una respuesta de hilo,
  // hay que abrir el hilo de su padre y resaltarla ahí; si es del timeline,
  // resaltarlo en la lista. Si todavía no está en la ventana paginada, se
  // piden páginas anteriores (con tope); el padre del hilo, si tampoco está,
  // se trae por id.
  const paginasPedidasRef = useRef(0);
  const trayendoPadreRef = useRef(false);
  useEffect(() => {
    if (!saltarA) return;
    const destino = messages.find((m) => m.id === saltarA);
    if (!destino) {
      if (hasMore && !loadingMore && paginasPedidasRef.current < 6) {
        paginasPedidasRef.current++;
        onLoadMore?.();
      } else if (!loadingMore) {
        onSaltoHecho?.();
      }
      return;
    }
    if (destino.is_thread_reply && destino.reply_to_id) {
      const abrir = (padre: ChatMessage) => {
        closeSidePanels("thread");
        setThreadParent(padre);
        setRespuestaResaltada(destino.id);
      };
      const padre = messages.find((m) => m.id === destino.reply_to_id);
      if (padre) { abrir(padre); onSaltoHecho?.(); return; }
      if (trayendoPadreRef.current) return;
      trayendoPadreRef.current = true;
      void (traerMensaje?.(destino.reply_to_id) ?? Promise.resolve(null)).then((p) => {
        trayendoPadreRef.current = false;
        if (p) abrir(p);
        onSaltoHecho?.();
      });
      return;
    }
    setHighlightedMsgId(destino.id);
    onSaltoHecho?.();
  }, [saltarA, messages, hasMore, loadingMore, onLoadMore, onSaltoHecho, traerMensaje, closeSidePanels]);

  // Drag-and-drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && messageInputRef.current) {
      messageInputRef.current.addFiles(files);
    }
  }, []);

  const hasSidePanel = searchOpen || (threadParent && !showSharedFiles) || showSharedFiles || (showGroupMembers && conversation.type === "group");

  return (
    <div
      className="flex flex-col h-full bg-background relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-xl flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 text-primary">
            <Upload className="h-12 w-12" />
            <p className="text-lg font-semibold">{t("messenger.chat.sueltaArchivos")}</p>
            <p className="text-sm text-muted-foreground">{t("messenger.chat.maxArchivos")}</p>
          </div>
        </div>
      )}

      <ChatHeader
        conversation={conversation}
        profiles={profiles}
        typingUsers={typingUsers}
        onSearchToggle={() => {
          if (searchOpen) {
            closeSidePanels();
          } else {
            closeSidePanels("search");
            setSearchOpen(true);
          }
        }}
        onBack={onBack}
        onStartVideoCall={onStartVideoCall}
        onOpenProfile={setProfileUserId}
        onOpenNotificationSettings={() => setShowNotifSettings(true)}
        onOpenSharedFiles={() => { closeSidePanels("files"); setShowSharedFiles(true); }}
        onOpenGroupMembers={() => { closeSidePanels("members"); setShowGroupMembers(true); }}
        onAvatarChanged={onMembersChanged}
        isPinned={isPinned}
        onTogglePin={onTogglePin}
        onArchive={onArchive}
        onDelete={onDelete}
        canDelete={canDelete}
        returnTo={returnTo}
      />

      <MessageList
        messages={mainMessages}
        profiles={profiles}
        chatType={conversation.type}
        currentUserId={user?.id}
        searchQuery={searchQuery}
        loading={loading}
        onReply={setReplyTo}
        onIrAlMensaje={irAlMensajeCitado}
        onOpenProfile={setProfileUserId}
        deletedArchive={deletedArchive}
        onCopy={(content) => { navigator.clipboard.writeText(content); toast.success(t("messenger.chat.copiado")); }}
        onEdit={onEditMessage}
        onDelete={onDeleteMessage}
        onRetry={onRetryMessage}
        getReactionsForMessage={getReactionsForMessage}
        onToggleReaction={onToggleReaction}
        getReadByUsers={getReadByUsers}
        getDeliveredByUsers={getDeliveredByUsers}
        totalParticipants={conversation.participants.length}
        highlightedMsgId={highlightedMsgId}
        onOpenThread={handleOpenThreadWithTracking}
        getThreadCount={getThreadCount}
        getUnreadThreadCount={getUnreadThreadCount}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
      />

      <TypingBubble
        typingUsers={typingUsers}
        profiles={profiles}
        isGroup={conversation.type === "group"}
      />

      {announcementLocked ? (
        <div className="shrink-0 px-4 py-3.5 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Megaphone className="h-3.5 w-3.5 shrink-0" /> {t("messenger.chat.soloAdminsEscriben")}
          </p>
        </div>
      ) : (
        <>
        <ProgramadosDelChat
          conversationId={conversation.id}
          onEnviar={onSendMessage}
          onEditar={(doc) => messageInputRef.current?.ponerParaEditar(doc)}
        />
        <MessageInput
          ref={messageInputRef}
          conversationId={conversation.id}
          onProgramar={programarEnChat}
          onSendMessage={onSendMessage}
          onSendTyping={onSendTyping}
          replyTo={replyTo}
          profiles={profiles}
          onCancelReply={() => setReplyTo(null)}
          participants={conversation.participants}
          chatType={conversation.type}
          aCiegas={mencionesACiegas}
        />
        </>
      )}

      {/* Side panel overlay — all panels render as absolute overlays */}
      {hasSidePanel && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="absolute inset-0 z-20 bg-black/20 sm:hidden"
            onClick={() => closeSidePanels()}
          />

          {searchOpen && (
            <SearchResultsPanel
              messages={messages}
              profiles={profiles}
              onResultClick={handleSearchResultClick}
              onClose={() => closeSidePanels()}
              onQueryChange={setSearchQuery}
            />
          )}

          {threadParent && !showSharedFiles && (
            <ThreadPanel
              parentMessage={threadParent}
              replies={threadReplies}
              profiles={profiles}
              currentUserId={user?.id}
              onSendReply={handleSendThreadReply}
              deletedArchive={deletedArchive}
              onClose={() => { setThreadParent(null); setRespuestaResaltada(null); }}
              resaltada={respuestaResaltada}
              participants={conversation.participants}
              aCiegas={mencionesACiegas}
              onEditMessage={onEditMessage}
              onDeleteMessage={onDeleteMessage}
              getReactionsForMessage={getReactionsForMessage}
              onToggleReaction={onToggleReaction}
              getReadByUsers={getReadByUsers}
              getDeliveredByUsers={getDeliveredByUsers}
              totalParticipants={conversation.participants.length}
            />
          )}

          {showSharedFiles && (
            <SharedFilesGallery
              conversationId={conversation.id}
              profiles={profiles}
              onClose={() => setShowSharedFiles(false)}
            />
          )}

          {showGroupMembers && conversation.type === "group" && (
            <GroupMembersPanel
              conversation={conversation}
              profiles={profiles}
              onClose={() => setShowGroupMembers(false)}
              onMembersChanged={() => { onMembersChanged?.(); }}
            />
          )}
        </>
      )}

      {showNotifSettings && (
        <div className="absolute right-4 top-16 z-50 w-72 bg-card rounded-3xl shadow-lg">
          <NotificationSettings
            conversation={conversation}
            onClose={() => setShowNotifSettings(false)}
          />
        </div>
      )}

      <ProfileCard userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </div>
  );
}
