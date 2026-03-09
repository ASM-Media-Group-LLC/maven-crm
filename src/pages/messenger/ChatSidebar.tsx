import { useState } from "react";
import { Search, Users, Video, MessageSquarePlus, Loader2, Trash2, SearchCheck, Contact } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ConversationWithDetails } from "./types";
import { cn } from "@/lib/utils";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import StatusPicker, { getStatusColor } from "./components/StatusPicker";
import DeleteChatDialog from "./components/DeleteChatDialog";

interface ChatSidebarProps {
  conversations: ConversationWithDetails[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  onOpenVideoRooms: () => void;
  onOpenContacts: () => void;
  onDeleteChat: (chatId: string) => Promise<boolean>;
  loading: boolean;
  onOpenGlobalSearch?: () => void;
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

export default function ChatSidebar({ conversations, activeChatId, onSelectChat, onNewChat, onNewGroup, onOpenVideoRooms, onOpenContacts, onDeleteChat, loading, onOpenGlobalSearch }: ChatSidebarProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<ConversationWithDetails | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = conversations.filter(c => {
    const matchesSearch = c.displayName.toLowerCase().includes(search.toLowerCase());
    if (tab === "unread") return matchesSearch && c.unreadCount > 0;
    if (tab === "groups") return matchesSearch && c.type === "group";
    return matchesSearch;
  });

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await onDeleteChat(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      {/* Header */}
      <div className="shrink-0 p-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Chats</h2>
            <StatusPicker />
          </div>
          <div className="flex gap-0.5">
            {onOpenGlobalSearch && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenGlobalSearch} title="Buscar en todo">
                <SearchCheck className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenContacts} title="Contactos">
              <Contact className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenVideoRooms} title="Video Rooms">
              <Video className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNewGroup} title="Nuevo grupo">
              <Users className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={onNewChat} title="Nuevo chat">
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar chats..."
            className="pl-9 h-9 bg-muted/40 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-xl"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-3 h-8 bg-muted/40 rounded-lg">
            <TabsTrigger value="all" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Todos</TabsTrigger>
            <TabsTrigger value="unread" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">No leídos</TabsTrigger>
            <TabsTrigger value="groups" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Grupos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mx-auto">
                <MessageSquarePlus className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {search ? "Sin resultados" : "Inicia una conversación"}
              </p>
            </div>
          ) : (
            filtered.map(conv => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeChatId}
                onClick={() => onSelectChat(conv.id)}
                onDelete={() => setDeleteTarget(conv)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <DeleteChatDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        chatName={deleteTarget?.displayName || ""}
        isGroup={deleteTarget?.type === "group"}
        onConfirm={handleConfirmDelete}
        isLoading={deleting}
      />
    </div>
  );
}

function ConversationItem({ conversation, isActive, onClick, onDelete }: {
  conversation: ConversationWithDetails;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const isGroup = conversation.type === "group";
  const { isOnline, getStatus } = useOnlinePresence();

  const otherParticipant = !isGroup
    ? conversation.participants.find(p => p.user_id !== conversation.created_by)
    : null;
  const online = otherParticipant ? isOnline(otherParticipant.user_id) : false;
  const status = otherParticipant ? getStatus(otherParticipant.user_id) : null;
  const hasUnread = conversation.unreadCount > 0;

  const lastMsgPreview = conversation.lastMessage
    ? conversation.lastMessage.type === "file"
      ? `📎 ${conversation.lastMessage.file_name}`
      : conversation.lastMessage.type === "image"
        ? "📷 Foto"
        : conversation.lastMessage.content || ""
    : "Sin mensajes";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150",
            isActive
              ? "bg-primary/10"
              : "hover:bg-muted/50",
            hasUnread && !isActive && "bg-muted/30"
          )}
        >
          {/* Avatar with status */}
          <div className="relative shrink-0">
            <Avatar className={cn("h-11 w-11", isActive && "ring-2 ring-primary/30")}>
              <AvatarFallback className={cn(
                "text-sm font-semibold",
                isGroup ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"
              )}>
                {isGroup ? <Users className="h-5 w-5" /> : getInitials(conversation.displayName)}
              </AvatarFallback>
            </Avatar>
            {!isGroup && (
              <span className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
                getStatusColor(status, online)
              )} />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className={cn(
                "text-sm truncate",
                hasUnread ? "font-bold text-foreground" : "font-medium text-foreground"
              )}>
                {conversation.displayName}
              </span>
              <span className={cn(
                "text-[11px] shrink-0 ml-2",
                hasUnread ? "text-primary font-semibold" : "text-muted-foreground"
              )}>
                {formatTime(conversation.lastMessage?.created_at)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-xs truncate",
                hasUnread ? "text-foreground font-medium" : "text-muted-foreground"
              )}>
                {truncate(lastMsgPreview, 45)}
              </p>
              {hasUnread && (
                <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-primary text-primary-foreground rounded-full shrink-0 ml-2 font-bold">
                  {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                </Badge>
              )}
            </div>
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" />
          Eliminar {isGroup ? "grupo" : "chat"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
