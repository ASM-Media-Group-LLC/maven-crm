import { useState } from "react";
import { Search, Pin, BellOff, Users, Video, MessageSquarePlus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversationWithDetails } from "./types";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
  conversations: ConversationWithDetails[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  onOpenVideoRooms: () => void;
  loading: boolean;
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function formatTime(dateStr?: string) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 86400000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 172800000) return "Ayer";
  return date.toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export default function ChatSidebar({ conversations, activeChatId, onSelectChat, onNewChat, onNewGroup, onOpenVideoRooms, loading }: ChatSidebarProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const filtered = conversations.filter(c => {
    const matchesSearch = c.displayName.toLowerCase().includes(search.toLowerCase());
    if (tab === "unread") return matchesSearch && c.unreadCount > 0;
    if (tab === "groups") return matchesSearch && c.type === "group";
    return matchesSearch;
  });

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      <div className="shrink-0 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Chats</h2>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={onOpenVideoRooms} title="Video Rooms">
              <Video className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onNewGroup} title="Nuevo grupo">
              <Users className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onNewChat} title="Nuevo chat">
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar o iniciar chat..."
            className="pl-9 h-9 bg-muted/50"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-3 h-8">
            <TabsTrigger value="all" className="text-xs">Todos</TabsTrigger>
            <TabsTrigger value="unread" className="text-xs">No leídos</TabsTrigger>
            <TabsTrigger value="groups" className="text-xs">Grupos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              {search ? "No se encontraron chats" : "No tienes conversaciones aún"}
            </p>
          ) : (
            filtered.map(conv => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeChatId}
                onClick={() => onSelectChat(conv.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ConversationItem({ conversation, isActive, onClick }: {
  conversation: ConversationWithDetails;
  isActive: boolean;
  onClick: () => void;
}) {
  const isGroup = conversation.type === "group";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors",
        isActive ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50"
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="h-11 w-11">
          <AvatarFallback className={cn(
            "text-sm font-medium",
            isGroup ? "bg-accent/20 text-accent-foreground" : "bg-primary/20 text-primary"
          )}>
            {isGroup ? <Users className="h-5 w-5" /> : getInitials(conversation.displayName)}
          </AvatarFallback>
        </Avatar>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm text-foreground truncate">
            {conversation.displayName}
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {formatTime(conversation.lastMessage?.created_at)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-muted-foreground truncate">
            {conversation.lastMessage
              ? truncate(
                  conversation.lastMessage.type === "file"
                    ? `📎 ${conversation.lastMessage.file_name}`
                    : conversation.lastMessage.content || "",
                  40
                )
              : "Sin mensajes"}
          </p>
          {conversation.unreadCount > 0 && (
            <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-primary text-primary-foreground rounded-full shrink-0">
              {conversation.unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}
