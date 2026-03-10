import { useState, useMemo } from "react";
import { Search, Users, Video, Trash2, SearchCheck, Contact, Pin, PinOff, GripVertical } from "lucide-react";
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
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ConversationWithDetails } from "./types";
import { cn } from "@/lib/utils";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { useAuth } from "@/hooks/useAuth";
import StatusPicker, { getStatusColor } from "./components/StatusPicker";
import DeleteChatDialog from "./components/DeleteChatDialog";
import SpacesPanel from "./components/SpacesPanel";
import { ChatSpace } from "@/hooks/useSpaces";

interface ChatSidebarProps {
  conversations: ConversationWithDetails[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewGroup: () => void;
  onOpenVideoRooms: () => void;
  onSelectContact: (userId: string) => void;
  onDeleteChat: (chatId: string) => Promise<boolean>;
  loading: boolean;
  onOpenGlobalSearch?: () => void;
  profiles: Record<string, import("./types").UserProfile>;
  // Pin props
  isPinned: (id: string) => boolean;
  onTogglePin: (id: string) => void;
  // Spaces props
  spaces: ChatSpace[];
  onCreateSpace: (name: string) => Promise<string | null>;
  onDeleteSpace: (id: string) => Promise<boolean>;
  onRenameSpace: (id: string, name: string) => Promise<boolean>;
  onAddConversationToSpace: (spaceId: string, convId: string) => Promise<boolean>;
  onRemoveConversationFromSpace: (spaceId: string, convId: string) => Promise<boolean>;
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

export default function ChatSidebar({
  conversations, activeChatId, onSelectChat, onNewGroup, onOpenVideoRooms,
  onSelectContact, onDeleteChat, loading, onOpenGlobalSearch, profiles,
  isPinned, onTogglePin,
  spaces, onCreateSpace, onDeleteSpace, onRenameSpace,
  onAddConversationToSpace, onRemoveConversationFromSpace,
}: ChatSidebarProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<ConversationWithDetails | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [draggingChatId, setDraggingChatId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return conversations.filter(c => {
      const matchesSearch = c.displayName.toLowerCase().includes(search.toLowerCase());
      if (tab === "unread") return matchesSearch && c.unreadCount > 0;
      if (tab === "groups") return matchesSearch && c.type === "group";
      if (tab === "pinned") return matchesSearch && isPinned(c.id);
      return matchesSearch;
    });
  }, [conversations, search, tab, isPinned]);

  // Sort: pinned first, then by last message
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aPinned = isPinned(a.id) ? 1 : 0;
      const bPinned = isPinned(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return 0; // keep existing order
    });
  }, [filtered, isPinned]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await onDeleteChat(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
  };

  const handleDragStart = (e: React.DragEvent, convId: string) => {
    e.dataTransfer.setData("conversationId", convId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingChatId(convId);
  };

  const handleDragEnd = () => {
    setDraggingChatId(null);
  };

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      {/* Header */}
      <div className="shrink-0 p-3 sm:p-4 pb-2 sm:pb-3 space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">Chats</h2>
            <StatusPicker />
          </div>
          <div className="flex gap-0.5">
            {onOpenGlobalSearch && (
              <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={onOpenGlobalSearch} title="Buscar en todo">
                <SearchCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={onOpenVideoRooms} title="Video Rooms">
              <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={onNewGroup} title="Nuevo grupo">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar chats..."
            className="pl-9 h-8 sm:h-9 bg-muted/40 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-xl text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-4 h-7 sm:h-8 bg-muted/40 rounded-lg">
            <TabsTrigger value="all" className="text-[10px] sm:text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Todos</TabsTrigger>
            <TabsTrigger value="unread" className="text-[10px] sm:text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">No leídos</TabsTrigger>
            <TabsTrigger value="pinned" className="text-[10px] sm:text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Fijados</TabsTrigger>
            <TabsTrigger value="groups" className="text-[10px] sm:text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Grupos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-1.5 sm:px-2 pb-2">
          {/* Spaces section */}
          <SpacesPanel
            spaces={spaces}
            conversations={conversations}
            activeChatId={activeChatId}
            onSelectChat={onSelectChat}
            onCreateSpace={onCreateSpace}
            onDeleteSpace={onDeleteSpace}
            onRenameSpace={onRenameSpace}
            onAddConversation={onAddConversationToSpace}
            onRemoveConversation={onRemoveConversationFromSpace}
            draggingChatId={draggingChatId}
          />

          {spaces.length > 0 && (
            <div className="border-b border-border/50 my-1.5 mx-2" />
          )}

          {/* Conversations list */}
          {sorted.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                {search ? "Sin resultados" : "Inicia una conversación"}
              </p>
            </div>
          ) : (
            sorted.map(conv => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeChatId}
                onClick={() => onSelectChat(conv.id)}
                onDelete={() => setDeleteTarget(conv)}
                isPinned={isPinned(conv.id)}
                onTogglePin={() => onTogglePin(conv.id)}
                onDragStart={(e) => handleDragStart(e, conv.id)}
                onDragEnd={handleDragEnd}
                spaces={spaces}
                onAddToSpace={onAddConversationToSpace}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Contacts section */}
      <ContactsSection profiles={profiles} onSelectContact={onSelectContact} />

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

function ContactsSection({ profiles, onSelectContact }: {
  profiles: Record<string, import("./types").UserProfile>;
  onSelectContact: (userId: string) => void;
}) {
  const { user } = useAuth();
  const { isOnline, getStatus } = useOnlinePresence();
  const [expanded, setExpanded] = useState(true);

  const contacts = useMemo(() => {
    return Object.values(profiles)
      .filter(p => p.id !== user?.id)
      .sort((a, b) => {
        const aOn = isOnline(a.id);
        const bOn = isOnline(b.id);
        if (aOn && !bOn) return -1;
        if (!aOn && bOn) return 1;
        return (a.full_name || "").localeCompare(b.full_name || "");
      });
  }, [profiles, user?.id, isOnline]);

  const onlineCount = useMemo(() => contacts.filter(p => isOnline(p.id)).length, [contacts, isOnline]);

  return (
    <div className="border-t border-border flex flex-col min-h-0 flex-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 sm:px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/30 transition-colors shrink-0"
      >
        <span className="flex items-center gap-1.5">
          <Contact className="h-3.5 w-3.5" />
          Contactos
        </span>
        <span className="text-[10px] font-normal normal-case">
          {onlineCount} en línea
        </span>
      </button>
      {expanded && (
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-1.5 sm:px-2 pb-2">
            {contacts.map(p => {
              const online = isOnline(p.id);
              const status = getStatus(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => onSelectContact(p.id)}
                  className="w-full flex items-center gap-2 sm:gap-2.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-6 w-6 sm:h-7 sm:w-7">
                      <AvatarFallback className="text-[9px] sm:text-[10px] font-semibold bg-primary/10 text-primary">
                        {getInitials(p.full_name || "?")}
                      </AvatarFallback>
                    </Avatar>
                    <span className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-[1.5px] border-card",
                      getStatusColor(status, online)
                    )} />
                  </div>
                  <span className={cn(
                    "text-xs truncate",
                    online ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {p.full_name || "Sin nombre"}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function ConversationItem({ conversation, isActive, onClick, onDelete, isPinned, onTogglePin, onDragStart, onDragEnd, spaces, onAddToSpace }: {
  conversation: ConversationWithDetails;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  spaces: ChatSpace[];
  onAddToSpace: (spaceId: string, convId: string) => Promise<boolean>;
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
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onClick={onClick}
          className={cn(
            "w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl text-left transition-all duration-150 group",
            isActive
              ? "bg-primary/10"
              : "hover:bg-muted/50",
            hasUnread && !isActive && "bg-muted/30"
          )}
        >
          {/* Drag handle */}
          <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab hidden sm:block" />

          {/* Avatar with status */}
          <div className="relative shrink-0">
            <Avatar className={cn("h-9 w-9 sm:h-11 sm:w-11", isActive && "ring-2 ring-primary/30")}>
              <AvatarFallback className={cn(
                "text-xs sm:text-sm font-semibold",
                isGroup ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"
              )}>
                {isGroup ? <Users className="h-4 w-4 sm:h-5 sm:w-5" /> : getInitials(conversation.displayName)}
              </AvatarFallback>
            </Avatar>
            {!isGroup && (
              <span className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full border-2 border-card",
                getStatusColor(status, online)
              )} />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className={cn(
                "text-xs sm:text-sm truncate flex items-center gap-1",
                hasUnread ? "font-bold text-foreground" : "font-medium text-foreground"
              )}>
                {isPinned && <Pin className="h-3 w-3 text-primary shrink-0 inline" />}
                {conversation.displayName}
              </span>
              <span className={cn(
                "text-[10px] sm:text-[11px] shrink-0 ml-2",
                hasUnread ? "text-primary font-semibold" : "text-muted-foreground"
              )}>
                {formatTime(conversation.lastMessage?.created_at)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-[11px] sm:text-xs truncate",
                hasUnread ? "text-foreground font-medium" : "text-muted-foreground"
              )}>
                {truncate(lastMsgPreview, 40)}
              </p>
              {hasUnread && (
                <Badge className="h-4 sm:h-5 min-w-4 sm:min-w-5 px-1 sm:px-1.5 text-[9px] sm:text-[10px] bg-primary text-primary-foreground rounded-full shrink-0 ml-2 font-bold">
                  {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                </Badge>
              )}
            </div>
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onTogglePin}>
          {isPinned ? <PinOff className="h-3.5 w-3.5 mr-2" /> : <Pin className="h-3.5 w-3.5 mr-2" />}
          {isPinned ? "Desanclar" : "Anclar"}
        </ContextMenuItem>
        {spaces.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>Agregar a espacio</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {spaces.map(space => (
                <ContextMenuItem key={space.id} onClick={() => onAddToSpace(space.id, conversation.id)}>
                  {space.icon} {space.name}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
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
