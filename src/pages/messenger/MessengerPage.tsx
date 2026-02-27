import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import ChatSidebar from "./ChatSidebar";
import ChatView from "./ChatView";
import VideoRoomsPanel from "./VideoRoomsPanel";
import LiveKitCallView from "./videocall/LiveKitCallView";
import NewChatModal from "./NewChatModal";
import { ConversationWithDetails, ChatMessage, VideoRoom } from "./types";
import { useChat, useMessages } from "@/hooks/useChat";
import { useReactions } from "@/hooks/useReactions";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { useNotificationPermission, useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function MessengerPage() {
  const { conversations, loading, profiles, createDirectChat, createGroupChat, deleteConversation } = useChat();
  const { isOnline, onlineUsers, getStatus } = useOnlinePresence();
  useNotificationPermission();
  const { notify } = useBrowserNotifications();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [videoRooms, setVideoRooms] = useState<VideoRoom[]>([]);
  const [showVideoRooms, setShowVideoRooms] = useState(false);
  const [activeCallRoom, setActiveCallRoom] = useState<{ roomName: string; displayName: string; isAdmin: boolean } | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const joinedFromLinkRef = useRef(false);

  const activeConv = conversations.find(c => c.id === activeChatId) || null;

  const handleNewMessage = useCallback((msg: ChatMessage) => {
    const senderName = profiles[msg.sender_id]?.full_name || "Nuevo mensaje";
    notify(senderName, msg.content || "📎 Archivo", () => {
      // Focus the conversation on click
      setActiveChatId(msg.conversation_id);
    });
  }, [profiles, notify]);

  const {
    messages, loading: msgsLoading, typingUsers,
    sendMessage, sendTyping, editMessage, deleteMessage,
  } = useMessages(activeChatId, handleNewMessage);

  const { toggleReaction, getReactionsForMessage, addMessageId } = useReactions(activeChatId);

  // Keep messageIdsRef in sync with loaded messages
  useEffect(() => { messages.forEach((m) => addMessageId(m.id)); }, [messages, addMessageId]);
  const messageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { getReadBy } = useReadReceipts(activeChatId, messageIds);

  const handleSelectUser = async (userId: string) => {
    const convId = await createDirectChat(userId);
    if (convId) setActiveChatId(convId);
    setNewChatOpen(false);
  };

  const handleCreateGroup = async (name: string, memberIds: string[]) => {
    const convId = await createGroupChat(name, memberIds);
    if (convId) setActiveChatId(convId);
    setNewGroupOpen(false);
  };

  const handleCreateRoom = (name: string) => {
    const roomId = `room-${Date.now()}`;
    const newRoom: VideoRoom = {
      id: roomId,
      name,
      createdBy: "me",
      createdAt: new Date(),
      participants: [],
      isActive: false,
      shareLink: `${window.location.origin}/messenger?room=${encodeURIComponent(roomId)}`,
    };
    setVideoRooms(prev => [newRoom, ...prev]);
    toast.success(`Sala "${name}" creada`);
  };

  const handleJoinRoom = (room: VideoRoom) => {
    const currentUser = Object.values(profiles).find(p => p.id);
    setActiveCallRoom({
      roomName: room.id,
      displayName: currentUser?.full_name || "Usuario",
      isAdmin: room.createdBy === "me",
    });
    setShowVideoRooms(false);
  };

  const handleStartVideoCall = (conv: ConversationWithDetails) => {
    const roomName = `call-${conv.id}`;
    const currentUser = Object.values(profiles).find(p => p.id);
    setActiveCallRoom({
      roomName,
      displayName: currentUser?.full_name || "Usuario",
      isAdmin: true,
    });
  };

  const handleDeleteChat = async (chatId: string) => {
    const success = await deleteConversation(chatId);
    if (success && activeChatId === chatId) {
      setActiveChatId(null);
    }
    return success;
  };

  useEffect(() => {
    if (joinedFromLinkRef.current || activeCallRoom) return;

    const roomParam = new URLSearchParams(window.location.search).get("room");
    if (!roomParam) return;

    const roomName = decodeURIComponent(roomParam).trim();
    if (!roomName) return;

    const currentUser = Object.values(profiles).find(p => p.id);
    setActiveCallRoom({
      roomName,
      displayName: currentUser?.full_name || "Usuario",
      isAdmin: false,
    });
    setShowVideoRooms(false);
    joinedFromLinkRef.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    toast.success("Uniéndote a la sala...");
  }, [profiles, activeCallRoom]);

  if (activeCallRoom) {
    return (
      <div className="h-full w-full">
        <LiveKitCallView
          roomName={activeCallRoom.roomName}
          displayName={activeCallRoom.displayName}
          isAdmin={activeCallRoom.isAdmin}
          onLeave={() => setActiveCallRoom(null)}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden bg-background">
      <div className={cn(
        "w-full md:w-[360px] lg:w-[400px] shrink-0 transition-all",
        activeChatId ? "hidden md:flex md:flex-col" : "flex flex-col"
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
            onSelectChat={setActiveChatId}
            onNewChat={() => setNewChatOpen(true)}
            onNewGroup={() => setNewGroupOpen(true)}
            onOpenVideoRooms={() => setShowVideoRooms(true)}
            onDeleteChat={handleDeleteChat}
            loading={loading}
          />
        )}
      </div>

      <div className={cn(
        "flex-1 min-w-0",
        !activeChatId ? "hidden md:flex" : "flex"
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
              onBack={() => setActiveChatId(null)}
              onStartVideoCall={handleStartVideoCall}
              loading={msgsLoading}
              getReactionsForMessage={getReactionsForMessage}
              onToggleReaction={toggleReaction}
              getReadByUsers={getReadBy}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-muted/20">
            <div className="text-center space-y-3">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <MessageSquare className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">Messenger</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Selecciona un chat para comenzar a conversar o inicia una nueva conversación
              </p>
            </div>
          </div>
        )}
      </div>

      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        profiles={profiles}
        onSelectUser={handleSelectUser}
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
    </div>
  );
}
