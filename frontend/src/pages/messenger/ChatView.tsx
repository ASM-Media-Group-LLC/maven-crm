import { useState, useMemo, useCallback, useRef } from "react";
import { ConversationWithDetails, ChatMessage, UserProfile } from "./types";
import { ReactionGroup } from "@/hooks/useReactions";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import ChatHeader from "./components/ChatHeader";
import MessageList from "./components/MessageList";
import MessageInput, { MessageInputHandle } from "./components/MessageInput";
import ThreadPanel from "./components/ThreadPanel";
import SearchResultsPanel from "./components/SearchResultsPanel";
import NotificationSettings from "./components/NotificationSettings";
import SharedFilesGallery from "./components/SharedFilesGallery";
import GroupMembersPanel from "./components/GroupMembersPanel";
import ProfileCard from "./components/ProfileCard";
import { Upload, Megaphone } from "lucide-react";

interface ChatViewProps {
  conversation: ConversationWithDetails;
  messages: ChatMessage[];
  profiles: Record<string, UserProfile>;
  typingUsers: string[];
  onSendMessage: (content: string, type?: ChatMessage["type"], fileUrl?: string, fileName?: string, replyToId?: string, albumId?: string, isThreadReply?: boolean) => void;
  onSendTyping: (isTyping: boolean) => void;
  onEditMessage: (id: string, content: string) => void;
  onDeleteMessage: (id: string) => void;
  onRetryMessage?: (id: string) => void;
  onBack: () => void;
  onStartVideoCall: (conv: ConversationWithDetails) => void;
  loading: boolean;
  getReactionsForMessage: (messageId: string) => ReactionGroup[];
  onToggleReaction: (messageId: string, emoji: string) => void;
  getReadByUsers: (messageId: string) => string[];
  getDeliveredByUsers: (messageId: string) => string[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onMembersChanged?: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
}

export default function ChatView({
  conversation, messages, profiles, typingUsers, onSendMessage, onSendTyping,
  onEditMessage, onDeleteMessage, onRetryMessage, onBack, onStartVideoCall, loading,
  getReactionsForMessage, onToggleReaction, getReadByUsers, getDeliveredByUsers,
  hasMore, loadingMore, onLoadMore, onMembersChanged,
  isPinned, onTogglePin, onArchive, onDelete, canDelete,
}: ChatViewProps) {
  const { user } = useAuth();
  // Grupo "anuncios": solo admins escriben. Un no-admin ve un aviso en vez del composer.
  const amAdmin = conversation.participants.find(p => p.user_id === user?.id)?.role === "admin";
  const announcementLocked = conversation.type === "group" && conversation.msg_permission === "admins" && !amAdmin;
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showSharedFiles, setShowSharedFiles] = useState(false);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const messageInputRef = useRef<MessageInputHandle>(null);

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

  const threadReplies = useMemo(() => {
    if (!threadParent) return [];
    return messages.filter(m => m.reply_to_id === threadParent.id);
  }, [threadParent, messages]);

  const handleSendThreadReply = useCallback((content: string, type?: ChatMessage["type"], fileUrl?: string, fileName?: string) => {
    if (!threadParent) return;
    // isThreadReply=true: el mensaje vive SOLO dentro del hilo (el timeline lo esconde).
    onSendMessage(content, type || "text", fileUrl, fileName, threadParent.id, undefined, true);
  }, [threadParent, onSendMessage]);

  const getThreadCount = useCallback((messageId: string) => {
    return messages.filter(m => m.reply_to_id === messageId).length;
  }, [messages]);

  const [seenThreadCounts, setSeenThreadCounts] = useState<Record<string, number>>({});

  const getUnreadThreadCount = useCallback((messageId: string) => {
    const total = messages.filter(m => m.reply_to_id === messageId).length;
    const seen = seenThreadCounts[messageId] || 0;
    return Math.max(0, total - seen);
  }, [messages, seenThreadCounts]);

  const handleOpenThreadWithTracking = useCallback((msg: ChatMessage) => {
    const parentId = msg.reply_to_id
      ? (messages.find(m => m.id === msg.reply_to_id) ? msg.reply_to_id : msg.id)
      : msg.id;
    const count = messages.filter(m => m.reply_to_id === parentId).length;
    setSeenThreadCounts(prev => ({ ...prev, [parentId]: count }));

    closeSidePanels("thread");
    if (msg.reply_to_id) {
      const parent = messages.find(m => m.id === msg.reply_to_id);
      if (parent) { setThreadParent(parent); return; }
    }
    setThreadParent(msg);
  }, [messages, closeSidePanels]);

  const handleSearchResultClick = useCallback((messageId: string) => {
    setHighlightedMsgId(messageId);
  }, []);

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
            <p className="text-lg font-semibold">Suelta archivos aquí</p>
            <p className="text-sm text-muted-foreground">Máx. 20 archivos, 350MB cada uno</p>
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
      />

      <MessageList
        messages={mainMessages}
        profiles={profiles}
        chatType={conversation.type}
        currentUserId={user?.id}
        searchQuery={searchQuery}
        loading={loading}
        onReply={setReplyTo}
        onOpenProfile={setProfileUserId}
        onCopy={(content) => { navigator.clipboard.writeText(content); toast.success("Copiado"); }}
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

      {announcementLocked ? (
        <div className="shrink-0 px-4 py-3.5 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Megaphone className="h-3.5 w-3.5 shrink-0" /> Solo los administradores pueden enviar mensajes
          </p>
        </div>
      ) : (
        <MessageInput
          ref={messageInputRef}
          conversationId={conversation.id}
          onSendMessage={onSendMessage}
          onSendTyping={onSendTyping}
          replyTo={replyTo}
          profiles={profiles}
          onCancelReply={() => setReplyTo(null)}
          participants={conversation.participants}
          chatType={conversation.type}
        />
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
              onClose={() => setThreadParent(null)}
              participants={conversation.participants}
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
