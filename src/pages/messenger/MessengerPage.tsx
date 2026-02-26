import { useState, useCallback } from "react";
import { MessageSquare } from "lucide-react";
import ChatSidebar from "./ChatSidebar";
import ChatView from "./ChatView";
import VideoRoomsPanel from "./VideoRoomsPanel";
import VideoCallView from "./VideoCallView";
import NewChatModal from "./NewChatModal";
import { Chat, Message, VideoRoom, Contact } from "./types";
import { mockContacts } from "./mockData";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function MessengerPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [videoRooms, setVideoRooms] = useState<VideoRoom[]>([]);
  const [showVideoRooms, setShowVideoRooms] = useState(false);
  const [activeCall, setActiveCall] = useState<VideoRoom | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  const activeChat = chats.find(c => c.id === activeChatId) || null;
  const activeMsgs = activeChatId ? (messages[activeChatId] || []) : [];

  const handleSendMessage = useCallback((content: string, type: Message["type"]) => {
    if (!activeChatId) return;
    const newMsg: Message = {
      id: `msg-${Date.now()}`,
      senderId: "me",
      content,
      timestamp: new Date(),
      status: "sent",
      type,
    };
    setMessages(prev => ({
      ...prev,
      [activeChatId]: [...(prev[activeChatId] || []), newMsg],
    }));
    // Update last message in chat list
    setChats(prev => prev.map(c =>
      c.id === activeChatId ? { ...c, lastMessage: newMsg } : c
    ));
    // Simulate delivery after 1s
    setTimeout(() => {
      setMessages(prev => ({
        ...prev,
        [activeChatId]: (prev[activeChatId] || []).map(m =>
          m.id === newMsg.id ? { ...m, status: "delivered" as const } : m
        ),
      }));
    }, 1000);
  }, [activeChatId]);

  const handleCreateRoom = (name: string) => {
    const newRoom: VideoRoom = {
      id: `room-${Date.now()}`,
      name,
      createdBy: "me",
      createdAt: new Date(),
      participants: [],
      isActive: false,
      shareLink: `${window.location.origin}/messenger?room=room-${Date.now()}`,
    };
    setVideoRooms(prev => [newRoom, ...prev]);
    toast.success(`Sala "${name}" creada`);
  };

  const handleJoinRoom = (room: VideoRoom) => {
    setActiveCall({ ...room, isActive: true });
    setShowVideoRooms(false);
    toast.success(`Conectado a "${room.name}"`);
  };

  const handleSelectContact = (contact: Contact) => {
    // Check if chat already exists
    const existing = chats.find(c => c.type === "individual" && c.participants[0]?.id === contact.id);
    if (existing) {
      setActiveChatId(existing.id);
    } else {
      const newChat: Chat = {
        id: `chat-${Date.now()}`,
        type: "individual",
        name: contact.name,
        participants: [contact],
        unreadCount: 0,
        isPinned: false,
        isMuted: false,
      };
      setChats(prev => [newChat, ...prev]);
      setMessages(prev => ({ ...prev, [newChat.id]: [] }));
      setActiveChatId(newChat.id);
    }
    setNewChatOpen(false);
  };

  const handleCreateGroup = (name: string, members: Contact[]) => {
    const newChat: Chat = {
      id: `chat-group-${Date.now()}`,
      type: "group",
      name,
      participants: members,
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
    };
    setChats(prev => [newChat, ...prev]);
    setMessages(prev => ({ ...prev, [newChat.id]: [] }));
    setActiveChatId(newChat.id);
    toast.success(`Grupo "${name}" creado`);
  };

  const handleStartVideoCall = (chat: Chat) => {
    const room: VideoRoom = {
      id: `call-${Date.now()}`,
      name: `Llamada - ${chat.name}`,
      createdBy: "me",
      createdAt: new Date(),
      participants: chat.participants,
      isActive: true,
      shareLink: `${window.location.origin}/messenger?room=call-${Date.now()}`,
    };
    setActiveCall(room);
  };

  // Full screen video call
  if (activeCall) {
    return (
      <div className="h-screen w-full">
        <VideoCallView room={activeCall} onLeave={() => { setActiveCall(null); toast.info("Llamada finalizada"); }} />
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden bg-background">
      {/* Chat sidebar - always visible on desktop, toggled on mobile */}
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
            chats={chats}
            activeChatId={activeChatId}
            onSelectChat={setActiveChatId}
            onNewChat={() => setNewChatOpen(true)}
            onNewGroup={() => setNewGroupOpen(true)}
            onOpenVideoRooms={() => setShowVideoRooms(true)}
          />
        )}
      </div>

      {/* Chat view or empty state */}
      <div className={cn(
        "flex-1 min-w-0",
        !activeChatId ? "hidden md:flex" : "flex"
      )}>
        {activeChat ? (
          <div className="flex-1">
            <ChatView
              chat={activeChat}
              messages={activeMsgs}
              onSendMessage={handleSendMessage}
              onBack={() => setActiveChatId(null)}
              onStartVideoCall={handleStartVideoCall}
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

      {/* Modals */}
      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        contacts={mockContacts}
        onSelectContact={handleSelectContact}
      />
      <NewChatModal
        open={newGroupOpen}
        onClose={() => setNewGroupOpen(false)}
        contacts={mockContacts}
        onSelectContact={() => {}}
        isGroup
        onCreateGroup={handleCreateGroup}
      />
    </div>
  );
}
