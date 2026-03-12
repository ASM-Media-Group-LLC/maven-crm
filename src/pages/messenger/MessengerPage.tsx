import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import ChatSidebar from "./ChatSidebar";
import ChatView from "./ChatView";
import VideoRoomsPanel from "./VideoRoomsPanel";
import NewChatModal from "./NewChatModal";
import GlobalSearchPanel from "./components/GlobalSearchPanel";
import IncomingCallModal from "./components/IncomingCallModal";
import { ConversationWithDetails, ChatMessage, VideoRoom } from "./types";
import { useChat, useMessages } from "@/hooks/useChat";
import { useReactions } from "@/hooks/useReactions";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { useNotificationPermission, useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import { useVideoCall } from "@/hooks/useVideoCall";
import { useSpaces } from "@/hooks/useSpaces";
import { usePinnedChats } from "@/hooks/usePinnedChats";
import { cn } from "@/lib/utils";
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
  const { conversations, loading, profiles, createDirectChat, createGroupChat, deleteConversation, loadConversations, markConversationRead } = useChat();
  const { isOnline, onlineUsers, getStatus } = useOnlinePresence();
  useNotificationPermission();
  const { notify } = useBrowserNotifications();
  const { incomingCall, acceptCall, declineCall } = useVideoCall();
  const { spaces, createSpace, deleteSpace, renameSpace, addConversationToSpace, removeConversationFromSpace } = useSpaces();
  const { isPinned, togglePin } = usePinnedChats();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const [videoRooms, setVideoRooms] = useState<VideoRoom[]>([]);
  const [showVideoRooms, setShowVideoRooms] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const joinedFromLinkRef = useRef(false);

  // Wrap setActiveChatId to also clear unread
  const selectChat = useCallback((chatId: string | null) => {
    setActiveChatId(chatId);
    activeChatIdRef.current = chatId;
    if (chatId) markConversationRead(chatId);
  }, [markConversationRead]);

  const activeConv = conversations.find(c => c.id === activeChatId) || null;

  const handleNewMessage = useCallback((msg: ChatMessage) => {
    // Don't notify for messages in the currently active chat
    if (activeChatIdRef.current === msg.conversation_id) {
      // But still clear unread for the active chat
      markConversationRead(msg.conversation_id);
      return;
    }
    const senderName = profiles[msg.sender_id]?.full_name || "Nuevo mensaje";
    notify(senderName, msg.content || "📎 Archivo", () => {
      selectChat(msg.conversation_id);
    });
  }, [profiles, notify, selectChat, markConversationRead]);

  const {
    messages, loading: msgsLoading, typingUsers,
    sendMessage, sendTyping, editMessage, deleteMessage,
    hasMore, loadingMore, loadOlderMessages,
  } = useMessages(activeChatId, handleNewMessage);

  const { toggleReaction, getReactionsForMessage, addMessageId } = useReactions(activeChatId);

  useEffect(() => { messages.forEach((m) => addMessageId(m.id)); }, [messages, addMessageId]);
  const messageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { getReadBy } = useReadReceipts(activeChatId, messageIds);

  const handleSelectUser = useCallback((userId: string) => {
    const convId = createDirectChat(userId);
    if (convId) selectChat(convId);
  }, [createDirectChat, selectChat]);

  const handleCreateGroup = (name: string, memberIds: string[]) => {
    const convId = createGroupChat(name, memberIds);
    if (convId) selectChat(convId);
    setNewGroupOpen(false);
  };

  const handleCreateRoom = (name: string) => {
    const roomId = `room-${Date.now()}`;
    const newRoom: VideoRoom = {
      id: roomId, name, createdBy: "me", createdAt: new Date(),
      participants: [], isActive: false,
      shareLink: `${window.location.origin}/call/${encodeURIComponent(roomId)}?name=${encodeURIComponent(name)}`,
    };
    setVideoRooms(prev => [newRoom, ...prev]);
    toast.success(`Sala "${name}" creada`);
  };

  const handleJoinRoom = (room: VideoRoom) => {
    openCallInNewTab(room.id, room.createdBy === "me", room.name);
    setShowVideoRooms(false);
  };

  const handleStartVideoCall = (conv: ConversationWithDetails) => {
    const roomName = `call-${conv.id}`;
    openCallInNewTab(roomName, true, conv.displayName);
  };

  const handleDeleteChat = async (chatId: string) => {
    const success = await deleteConversation(chatId);
    if (success && activeChatId === chatId) selectChat(null);
    return success;
  };

  const handleGlobalSearchResult = useCallback((conversationId: string, _messageId: string) => {
    selectChat(conversationId);
    setGlobalSearchOpen(false);
  }, [selectChat]);

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
          <VideoRoomsPanel
            rooms={videoRooms}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onClose={() => setShowVideoRooms(false)}
          />
        ) : (
            <ChatSidebar
              conversations={conversations}
              activeChatId={activeChatId}
              onSelectChat={selectChat}
              onNewGroup={() => setNewGroupOpen(true)}
              onOpenVideoRooms={() => setShowVideoRooms(true)}
              onSelectContact={handleSelectUser}
              onDeleteChat={handleDeleteChat}
              loading={loading}
              profiles={profiles}
              isPinned={isPinned}
              onTogglePin={togglePin}
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
            <ChatView
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
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadOlderMessages}
              onMembersChanged={loadConversations}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-muted/10">
            <div className="text-center space-y-4 px-4">
              <div className="h-20 w-20 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto">
                <MessageSquare className="h-10 w-10 text-primary/60" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-semibold text-foreground">No conversation selected</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Selecciona un chat o contacto para comenzar a conversar
                </p>
              </div>
            </div>
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
        open={newGroupOpen}
        onClose={() => setNewGroupOpen(false)}
        profiles={profiles}
        onSelectUser={() => {}}
        isGroup
        onCreateGroup={handleCreateGroup}
        isOnlineFn={isOnline}
        getStatusFn={getStatus}
      />
    </div>
  );
}
