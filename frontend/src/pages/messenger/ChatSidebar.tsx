import { useState, useMemo, useEffect, useCallback } from "react";
import { Search, Users, Video, Pin, PinOff, GripVertical, Home, AtSign, Star, Mail, ChevronDown, ChevronRight, MessageSquarePlus, X, User, MessageSquare, Archive, MoreVertical, Trash2, Bell, BellOff } from "lucide-react";
import { useGlobalSearch, type GlobalSearchResult } from "@/hooks/useGlobalSearch";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ConversationWithDetails } from "./types";
import { cn } from "@/lib/utils";
import { avatarGradient } from "@/lib/avatarColor";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import StatusPicker, { getStatusColor } from "./components/StatusPicker";
import DeleteChatDialog from "./components/DeleteChatDialog";
import SpacesPanel from "./components/SpacesPanel";
import { ChatSpace } from "@/hooks/useSpaces";
import { useMentionedConversations } from "@/hooks/useMentionedConversations";
import { getInitials } from "./utils";

interface ChatSidebarProps {
  conversations: ConversationWithDetails[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  onOpenVideoRooms: () => void;
  onSelectContact: (userId: string) => void;
  onDeleteChat: (chatId: string) => Promise<boolean>;
  loading: boolean;
  profiles: Record<string, import("./types").UserProfile>;
  isPinned: (id: string) => boolean;
  onTogglePin: (id: string) => void;
  isArchived: (id: string) => boolean;
  onToggleArchive: (id: string) => void;
  onToggleMute: (id: string, muted: boolean) => void;
  spaces: ChatSpace[];
  onCreateSpace: (name: string) => Promise<string | null>;
  onDeleteSpace: (id: string) => Promise<boolean>;
  onRenameSpace: (id: string, name: string) => Promise<boolean>;
  onAddConversationToSpace: (spaceId: string, convId: string) => Promise<boolean>;
  onRemoveConversationFromSpace: (spaceId: string, convId: string) => Promise<boolean>;
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
  // "14 jul", no "14/07": el formato numérico es ambiguo (¿día/mes o
  // mes/día?) y el resto de la app ya usa el mes abreviado.
  return date.toLocaleDateString("es", { day: "numeric", month: "short" });
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export default function ChatSidebar({
  conversations, activeChatId, onSelectChat, onNewChat, onNewGroup, onOpenVideoRooms,
  onSelectContact, onDeleteChat, loading, profiles,
  isPinned, onTogglePin, isArchived, onToggleArchive, onToggleMute,
  spaces, onCreateSpace, onDeleteSpace, onRenameSpace,
  onAddConversationToSpace, onRemoveConversationFromSpace,
}: ChatSidebarProps) {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { isOnline, getStatus } = useOnlinePresence();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const { results: globalResults, searching: globalSearching, search: globalSearch, clearResults: clearGlobalResults } = useGlobalSearch();

  useEffect(() => {
    if (search.trim().length >= 2) {
      globalSearch(search);
    } else {
      clearGlobalResults();
    }
  }, [search, globalSearch, clearGlobalResults]);
  const [deleteTarget, setDeleteTarget] = useState<ConversationWithDetails | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [draggingChatId, setDraggingChatId] = useState<string | null>(null);
  const [dmExpanded, setDmExpanded] = useState(true);
  const [contactsExpanded, setContactsExpanded] = useState(false);

  const currentUserName = user ? profiles[user.id]?.full_name : null;

  const convIds = useMemo(() => conversations.map(c => c.id), [conversations]);
  const { mentionedIds } = useMentionedConversations(currentUserName, convIds);

  const filtered = useMemo(() => {
    return conversations.filter(c => {
      // Hide archived unless specifically searching
      if (isArchived(c.id) && tab !== "all") return false;
      const matchesSearch = c.displayName.toLowerCase().includes(search.toLowerCase());
      if (tab === "unread") return matchesSearch && c.unreadCount > 0;
      if (tab === "groups") return matchesSearch && c.type === "group";
      if (tab === "pinned") return matchesSearch && isPinned(c.id);
      if (tab === "mentions") return matchesSearch && mentionedIds.has(c.id);
      // In "all" tab, hide archived unless searching
      if (!search && isArchived(c.id)) return false;
      return matchesSearch;
    });
  }, [conversations, search, tab, isPinned, mentionedIds, isArchived]);

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
    <div className="flex flex-col h-full bg-card/50 overflow-hidden">
      {/* Header — M3 tonal surface */}
      <div className="shrink-0 px-3 sm:px-4 pt-3 pb-2 space-y-2.5 bg-primary/[0.03]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <StatusPicker />
          </div>
          <div className="flex gap-0.5">
            <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8 rounded-full hover:bg-primary/8" onClick={onOpenVideoRooms} title="Reuniones">
              <Video className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8 rounded-full hover:bg-primary/8" onClick={onNewChat} title="Nuevo chat">
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8 rounded-full hover:bg-primary/8" onClick={onNewGroup} title="Nuevo grupo">
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search — M3 pill */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar en todos los chats…"
            className="pl-10 pr-8 h-11 sm:h-9 bg-primary/5 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-full text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* [&_[data-radix-scroll-area-viewport]>div]: Radix envuelve el contenido en un div
          display:table; min-width:100% que crece más que el viewport (nombres largos, URLs)
          y se comía el borde derecho (timestamps, badge de no-leídos). Forzarlo a block lo
          clampa al ancho del viewport y deja que truncate/min-w-0 funcionen. */}
      <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
        <div className="pb-6">
          {/* Quick access section */}
          <CollapsibleSection label="Acceso Rápido" defaultOpen>
            <div className="flex flex-wrap gap-1.5 px-3 pb-1">
              {[
                { key: "all", icon: Home, label: "Todos", badge: 0 },
                { key: "unread", icon: Mail, label: "No leídos", badge: unreadTotal },
                { key: "mentions", icon: AtSign, label: "Menciones", badge: mentionedIds.size },
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
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.badge > 0 && (
                      <Badge className="h-4 min-w-4 px-1 text-[9px] bg-primary text-primary-foreground rounded-full font-bold">
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
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors"
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
                      onArchive={() => onToggleArchive(conv.id)}
                      isArchivedChat={isArchived(conv.id)}
                      onToggleMute={onToggleMute}
                      onDragStart={(e) => handleDragStart(e, conv.id)}
                      onDragEnd={handleDragEnd}
                      spaces={spaces}
                      onAddToSpace={onAddConversationToSpace}
                      isSystemAdmin={isAdmin}
                    />
                  ))
                )}
              </>
            )}
          </div>

          {/* Global message search results */}
          {search.trim().length >= 2 && (
            <div className="mt-1 px-2">
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                <Search className="h-3.5 w-3.5" />
                <span>Resultados en mensajes</span>
              </div>
              {globalSearching && globalResults.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <div className="h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-[11px] text-muted-foreground">Buscando…</p>
                </div>
              )}
              {!globalSearching && globalResults.length === 0 && (
                <p className="text-[11px] text-muted-foreground px-3 py-2">No se encontraron mensajes</p>
              )}
              {(() => {
                const grouped = globalResults.reduce<Record<string, { title: string; results: GlobalSearchResult[] }>>((acc, r) => {
                  if (!acc[r.conversationId]) acc[r.conversationId] = { title: r.conversationTitle, results: [] };
                  acc[r.conversationId].results.push(r);
                  return acc;
                }, {});
                return Object.entries(grouped).map(([convId, group]) => (
                  <div key={convId} className="mb-1">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-2xl bg-primary/5">
                      <MessageSquare className="h-3 w-3 text-primary shrink-0" />
                      <span className="text-[11px] font-semibold text-foreground truncate">{group.title}</span>
                      <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px] rounded-full ml-auto">
                        {group.results.length}
                      </Badge>
                    </div>
                    {group.results.map((r) => (
                      <button
                        key={r.messageId}
                        onClick={() => onSelectChat(r.conversationId)}
                        className="w-full text-left px-3 py-1.5 hover:bg-primary/5 transition-colors rounded-2xl"
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <User className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-[11px] font-medium text-foreground">{r.senderName}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                            {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true, locale: es })}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed truncate">
                          {r.content}
                        </p>
                      </button>
                    ))}
                  </div>
                ));
              })()}
            </div>
          )}

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
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors"
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
                      className="w-full flex items-center gap-2.5 px-3 py-[7px] min-h-[40px] sm:min-h-0 rounded-2xl text-left hover:bg-primary/5 transition-colors"
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-7 w-7">
                          {p.avatar_url && <AvatarImage src={p.avatar_url} alt={p.full_name || ""} className="object-cover" />}
                          <AvatarFallback className={cn("text-[10px] font-bold text-white bg-gradient-to-br", avatarGradient(p.id))}>
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
        className="w-full flex items-center gap-1.5 px-3 pb-0.5 pt-1 select-none hover:bg-primary/5 rounded-2xl transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</span>
      </button>
      {open && children}
    </div>
  );
}

/* ── Conversation Item — M3 ── */
function ConversationItem({ conversation, isActive, onClick, onDelete, isPinned, onTogglePin, onArchive, isArchivedChat, onToggleMute, onDragStart, onDragEnd, spaces, onAddToSpace, isSystemAdmin }: {
  conversation: ConversationWithDetails;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onArchive: () => void;
  isArchivedChat: boolean;
  onToggleMute: (id: string, muted: boolean) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  spaces: ChatSpace[];
  onAddToSpace: (spaceId: string, convId: string) => Promise<boolean>;
  isSystemAdmin?: boolean;
}) {
  const { user } = useAuth();
  const isGroup = conversation.type === "group";
  const { isOnline, getStatus } = useOnlinePresence();
  const isMuted = conversation.participants.find(p => p.user_id === user?.id)?.is_muted ?? false;
  const handleToggleMute = () => onToggleMute(conversation.id, !isMuted);

  const otherParticipant = !isGroup
    ? conversation.participants.find(p => p.user_id !== user?.id)
    : null;
  const online = otherParticipant ? isOnline(otherParticipant.user_id) : false;
  const status = otherParticipant ? getStatus(otherParticipant.user_id) : null;
  const hasUnread = conversation.unreadCount > 0;

  const lastMsg = conversation.lastMessage;
  const getMessagePreview = () => {
    if (!lastMsg) return "Sin mensajes";
    if (lastMsg.is_deleted) return "🚫 Mensaje eliminado";
    if (lastMsg.type === "system") return `ℹ️ ${lastMsg.content || ""}`;
    let body = "";
    if (lastMsg.type === "file") body = `📎 ${lastMsg.file_name}`;
    else if (lastMsg.type === "image") body = "📷 Foto";
    else body = lastMsg.content || "";
    if (isGroup && lastMsg.sender_id) {
      const senderName = lastMsg.sender_id === user?.id
        ? "Tú"
        : (conversation.participants.find(p => p.user_id === lastMsg.sender_id)?.profile?.full_name?.split(" ")[0] || "");
      if (senderName) return `${senderName}: ${body}`;
    }
    return body;
  };
  const lastMsgPreview = getMessagePreview();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onClick={onClick}
          className={cn(
            "w-full flex items-center gap-2.5 px-2.5 py-2.5 sm:py-2 rounded-2xl text-left transition-all duration-150 group relative",
            isActive
              ? "bg-primary/12 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-gradient-to-b before:from-accent before:to-primary"
              : "hover:bg-primary/5",
            hasUnread && !isActive && "bg-primary/[0.04]"
          )}
        >
          {/* Drag handle */}
          <GripVertical className="h-3 w-3 text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab hidden sm:block" />

          {/* Avatar */}
          <div className="relative shrink-0">
            <Avatar className={cn("h-10 w-10 sm:h-9 sm:w-9", isActive && "ring-2 ring-primary/20")}>
              {conversation.avatar_url && <AvatarImage src={conversation.avatar_url} alt={conversation.displayName} className="object-cover" />}
              {!conversation.avatar_url && !isGroup && otherParticipant?.profile?.avatar_url && (
                <AvatarImage src={otherParticipant.profile.avatar_url} alt={conversation.displayName} className="object-cover" />
              )}
              <AvatarFallback className={cn(
                "text-xs font-bold text-white bg-gradient-to-br",
                isGroup ? "from-violet-600 to-fuchsia-600" : avatarGradient(conversation.id)
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
                "text-[10px] shrink-0 ml-2 mr-5 flex items-center gap-1",
                hasUnread ? "text-primary font-semibold" : "text-muted-foreground"
              )}>
                {isMuted && <BellOff className="h-3 w-3 text-muted-foreground" />}
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
          {/* 3-dot menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div
                role="button"
                tabIndex={0}
                onClick={e => e.stopPropagation()}
                className="absolute top-1.5 right-1.5 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity z-10"
              >
                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl">
              <DropdownMenuItem onClick={onTogglePin}>
                {isPinned ? <PinOff className="h-3.5 w-3.5 mr-2" /> : <Pin className="h-3.5 w-3.5 mr-2" />}
                {isPinned ? "Desanclar" : "Anclar"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onArchive}>
                <Archive className="h-3.5 w-3.5 mr-2" />
                {isArchivedChat ? "Desarchivar" : "Archivar"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleMute}>
                {isMuted ? <Bell className="h-3.5 w-3.5 mr-2" /> : <BellOff className="h-3.5 w-3.5 mr-2" />}
                {isMuted ? "Reactivar notificaciones" : "Silenciar notificaciones"}
              </DropdownMenuItem>
              {spaces.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Agregar a espacio</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="rounded-2xl">
                    {spaces.map(space => (
                      <DropdownMenuItem key={space.id} onClick={() => onAddToSpace(space.id, conversation.id)}>
                        {space.icon} {space.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {(isSystemAdmin || !isGroup || conversation.participants.find(p => p.user_id === user?.id)?.role === "admin") && (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Eliminar {isGroup ? "grupo" : "chat"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="rounded-2xl">
        <ContextMenuItem onClick={onTogglePin}>
          {isPinned ? <PinOff className="h-3.5 w-3.5 mr-2" /> : <Pin className="h-3.5 w-3.5 mr-2" />}
          {isPinned ? "Desanclar" : "Anclar"}
        </ContextMenuItem>
        <ContextMenuItem onClick={onArchive}>
          <Archive className="h-3.5 w-3.5 mr-2" />
          {isArchivedChat ? "Desarchivar" : "Archivar"}
        </ContextMenuItem>
        <ContextMenuItem onClick={handleToggleMute}>
          {isMuted ? <Bell className="h-3.5 w-3.5 mr-2" /> : <BellOff className="h-3.5 w-3.5 mr-2" />}
          {isMuted ? "Reactivar notificaciones" : "Silenciar notificaciones"}
        </ContextMenuItem>
        {spaces.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>Agregar a espacio</ContextMenuSubTrigger>
            <ContextMenuSubContent className="rounded-2xl">
              {spaces.map(space => (
                <ContextMenuItem key={space.id} onClick={() => onAddToSpace(space.id, conversation.id)}>
                  {space.icon} {space.name}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {(isSystemAdmin || !isGroup || conversation.participants.find(p => p.user_id === user?.id)?.role === "admin") && (
          <ContextMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <span className="h-3.5 w-3.5 mr-2">🗑</span>
            Eliminar {isGroup ? "grupo" : "chat"}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
