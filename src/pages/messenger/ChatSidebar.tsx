import { useState, useMemo } from "react";
import { Search, Users, Video, Trash2, SearchCheck, Pin, PinOff, GripVertical, Home, AtSign, Star, Mail, ChevronDown, ChevronRight, MessageSquarePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  isPinned: (id: string) => boolean;
  onTogglePin: (id: string) => void;
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
  const { user } = useAuth();
  const { isOnline, getStatus } = useOnlinePresence();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<ConversationWithDetails | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [draggingChatId, setDraggingChatId] = useState<string | null>(null);
  const [dmExpanded, setDmExpanded] = useState(true);
  const [contactsExpanded, setContactsExpanded] = useState(false);

  const filtered = useMemo(() => {
    return conversations.filter(c => {
      const matchesSearch = c.displayName.toLowerCase().includes(search.toLowerCase());
      if (tab === "unread") return matchesSearch && c.unreadCount > 0;
      if (tab === "groups") return matchesSearch && c.type === "group";
      if (tab === "pinned") return matchesSearch && isPinned(c.id);
      return matchesSearch;
    });
  }, [conversations, search, tab, isPinned]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aPinned = isPinned(a.id) ? 1 : 0;
      const bPinned = isPinned(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return 0;
    });
  }, [filtered, isPinned]);

  const unreadTotal = useMemo(() => conversations.reduce((s, c) => s + c.unreadCount, 0), [conversations]);

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
      {/* Header — Google Chat style */}
      <div className="shrink-0 px-3 sm:px-4 pt-3 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <StatusPicker />
          </div>
          <div className="flex gap-0.5">
            {onOpenGlobalSearch && (
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onOpenGlobalSearch} title="Buscar en todo">
                <SearchCheck className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onOpenVideoRooms} title="Video Rooms">
              <Video className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onNewGroup} title="Nuevo grupo">
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar chats..."
            className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-full text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="pb-2">
          {/* Acceso Rápido section */}
          <CollapsibleSection label="Acceso Rápido" defaultOpen>
            <div className="px-2 pb-1">
              {[
                { key: "all", icon: Home, label: "Todos", badge: 0 },
                { key: "unread", icon: Mail, label: "No leídos", badge: unreadTotal },
                { key: "pinned", icon: Star, label: "Fijados", badge: 0 },
                { key: "groups", icon: Users, label: "Grupos", badge: 0 },
              ].map(item => {
                const isActive = tab === item.key;
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => setTab(item.key)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-[7px] rounded-full text-sm transition-colors",
                      isActive
                        ? "bg-primary/12 text-primary font-medium"
                        : "text-foreground/70 hover:bg-muted/60 font-normal"
                    )}
                  >
                    <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                    <span className="truncate flex-1 text-left">{item.label}</span>
                    {item.badge > 0 && (
                      <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-primary text-primary-foreground rounded-full font-bold">
                        {item.badge > 99 ? "99+" : item.badge}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </CollapsibleSection>

          {/* Direct messages section */}
          <div className="mt-1 px-2">
            <button
              onClick={() => setDmExpanded(!dmExpanded)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              {dmExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>Mensajes directos</span>
              {sorted.length > 0 && (
                <span className="ml-auto text-[10px] font-normal normal-case text-muted-foreground/70">
                  {sorted.length}
                </span>
              )}
            </button>

            {dmExpanded && (
              <>
                {sorted.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-xs text-muted-foreground">
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
              </>
            )}
          </div>

          {/* Spaces section */}
          <div className="mt-1 px-1">
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
          </div>

          {/* Contacts section */}
          <div className="mt-1 px-2">
            <button
              onClick={() => setContactsExpanded(!contactsExpanded)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              {contactsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>Contactos</span>
              <span className="ml-auto text-[10px] font-normal normal-case text-muted-foreground/70">
                {onlineCount} en línea
              </span>
            </button>

            {contactsExpanded && (
              <div className="space-y-0.5">
                {contacts.map(p => {
                  const online = isOnline(p.id);
                  const status = getStatus(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => onSelectContact(p.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-[7px] rounded-full text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-7 w-7">
                          {p.avatar_url && <AvatarImage src={p.avatar_url} alt={p.full_name || ""} className="object-cover" />}
                          <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                            {getInitials(p.full_name || "?")}
                          </AvatarFallback>
                        </Avatar>
                        <span className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-[1.5px] border-card",
                          getStatusColor(status, online)
                        )} />
                      </div>
                      <span className={cn(
                        "text-sm truncate",
                        online ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {p.full_name || "Sin nombre"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
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

/* ── Collapsible Section Header ── */
function CollapsibleSection({ label, defaultOpen = true, children }: { label: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-3 pb-0.5 pt-1 select-none hover:bg-muted/40 rounded transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      </button>
      {open && children}
    </div>
  );
}

/* ── Section Header (Google Chat style) ── */
function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-semibold text-muted-foreground px-3 pb-0.5 pt-1 uppercase tracking-wider select-none">
      {label}
    </p>
  );
}

/* ── Conversation Item ── */
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
            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-150 group",
            isActive
              ? "bg-primary/10"
              : "hover:bg-muted/50",
            hasUnread && !isActive && "bg-muted/30"
          )}
        >
          {/* Drag handle */}
          <GripVertical className="h-3 w-3 text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab hidden sm:block" />

          {/* Avatar */}
          <div className="relative shrink-0">
            <Avatar className={cn("h-9 w-9", isActive && "ring-2 ring-primary/30")}>
              {conversation.avatar_url && <AvatarImage src={conversation.avatar_url} alt={conversation.displayName} className="object-cover" />}
              {!conversation.avatar_url && !isGroup && otherParticipant?.profile?.avatar_url && (
                <AvatarImage src={otherParticipant.profile.avatar_url} alt={conversation.displayName} className="object-cover" />
              )}
              <AvatarFallback className={cn(
                "text-xs font-semibold",
                isGroup ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"
              )}>
                {isGroup ? <Users className="h-4 w-4" /> : getInitials(conversation.displayName)}
              </AvatarFallback>
            </Avatar>
            {!isGroup && (
              <span className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                getStatusColor(status, online)
              )} />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className={cn(
                "text-sm truncate flex items-center gap-1",
                hasUnread ? "font-bold text-foreground" : "font-medium text-foreground"
              )}>
                {isPinned && <Pin className="h-3 w-3 text-primary shrink-0 inline" />}
                {conversation.displayName}
              </span>
              <span className={cn(
                "text-[10px] shrink-0 ml-2",
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
                {truncate(lastMsgPreview, 38)}
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
          <span className="h-3.5 w-3.5 mr-2">🗑</span>
          Eliminar {isGroup ? "grupo" : "chat"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
