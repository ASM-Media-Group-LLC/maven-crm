import InstalarMaven from "@/components/pwa/InstalarMaven";
import { esTactil } from "@/lib/plataformaPwa";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Search, Users, Pin, PinOff, GripVertical, Home, AtSign, Star, Mail, ChevronDown, ChevronRight, ChevronsUpDown, ChevronsDownUp, X, User, MessageSquare, Archive, MoreVertical, Trash2, Bell, BellOff, Plus, Pencil } from "lucide-react";
import { BotonSilenciarCanal } from "@/components/BotonSilenciarCanal";
import { useGlobalSearch, type GlobalSearchResult } from "@/hooks/useGlobalSearch";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConversationWithDetails } from "./types";
import { formatTime, truncate, getMessagePreview } from "./preview";
import { cn } from "@/lib/utils";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import StatusPicker, { getStatusColor } from "./components/StatusPicker";
import DeleteChatDialog from "./components/DeleteChatDialog";
import { useMentionedConversations } from "@/hooks/useMentionedConversations";
import { getDraft } from "./drafts";
import { useTypingInbox } from "@/hooks/useTypingInbox";

interface ChatSidebarProps {
  conversations: ConversationWithDetails[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  onSelectContact: (userId: string) => void;
  onDeleteChat: (chatId: string) => Promise<boolean>;
  loading: boolean;
  profiles: Record<string, import("./types").UserProfile>;
  isPinned: (id: string) => boolean;
  onTogglePin: (id: string) => void;
  pinnedOrder: string[];
  onReorderPinned: (orderedIds: string[]) => void;
  isArchived: (id: string) => boolean;
  onToggleArchive: (id: string) => void;
  onToggleMute: (id: string, muted: boolean) => void;
}


export default function ChatSidebar({
  conversations, activeChatId, onSelectChat, onNewChat, onNewGroup,
  onSelectContact, onDeleteChat, loading, profiles,
  isPinned, onTogglePin, pinnedOrder, onReorderPinned, isArchived, onToggleArchive, onToggleMute,
}: ChatSidebarProps) {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { isOnline, getStatus, getStatusColorPersonal } = useOnlinePresence();
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
  const [groupsExpanded, setGroupsExpanded] = useState(true);
  const [contactsExpanded, setContactsExpanded] = useState(false);

  const currentUserName = user ? profiles[user.id]?.full_name : null;

  const convIds = useMemo(() => conversations.map(c => c.id), [conversations]);
  const { mentionedIds } = useMentionedConversations(currentUserName, convIds);

  const filtered = useMemo(() => {
    return conversations.filter(c => {
      const matchesSearch = c.displayName.toLowerCase().includes(search.toLowerCase());
      // Tab "Archivados": muestra SOLO los archivados.
      if (tab === "archived") return matchesSearch && isArchived(c.id);
      // En cualquier otro tab, los archivados viven aparte (en su propio tab).
      if (isArchived(c.id)) return false;
      if (tab === "unread") return matchesSearch && c.unreadCount > 0;
      if (tab === "groups") return matchesSearch && c.type === "group";
      if (tab === "pinned") return matchesSearch && isPinned(c.id);
      if (tab === "mentions") return matchesSearch && mentionedIds.has(c.id);
      return matchesSearch;
    });
  }, [conversations, search, tab, isPinned, mentionedIds, isArchived]);

  const sorted = useMemo(() => {
    const pinRank = (id: string) => {
      const i = pinnedOrder.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...filtered].sort((a, b) => {
      const aPinned = isPinned(a.id) ? 1 : 0;
      const bPinned = isPinned(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      // Fijados: por el orden manual (position). Normales: se mantiene el orden de
      // `filtered` (recencia) devolviendo 0 (sort estable).
      if (aPinned && bPinned) return pinRank(a.id) - pinRank(b.id);
      return 0;
    });
  }, [filtered, isPinned, pinnedOrder]);

  // Organización estilo Google Chat: los DMs y los grupos viven en secciones
  // separadas (antes iban mezclados y los grupos además tenían "Espacios").
  const sortedDirect = useMemo(() => sorted.filter(c => c.type !== "group"), [sorted]);

  // "Mensajes directos" muestra como mucho 10 (estilo Google Chat): con 25+
  // DMs la lista se hacía interminable y Grupos/Contactos quedaban a tres
  // scrolls de distancia. Reglas para que nada se PIERDA al recortar:
  //   · buscando, se muestran todos los resultados (recortar una búsqueda es mentir);
  //   · el chat ABIERTO nunca se esconde, esté donde esté en la lista;
  //   · el renglón "Mostrar todo" avisa cuántos quedan ocultos y cuántos de
  //     esos tienen no leídos — así un mensaje nuevo en el DM nº 14 no pasa
  //     desapercibido.
  const DM_VISIBLES = 10;
  const [dmMostrarTodos, setDmMostrarTodos] = useState(false);
  const dmRecorte = useMemo(() => {
    const recortar = !search.trim() && !dmMostrarTodos && sortedDirect.length > DM_VISIBLES;
    if (!recortar) return { visibles: sortedDirect, ocultos: [] as ConversationWithDetails[] };
    const visibles = sortedDirect.slice(0, DM_VISIBLES);
    const activoOculto = activeChatId ? sortedDirect.slice(DM_VISIBLES).find(c => c.id === activeChatId) : undefined;
    if (activoOculto) visibles.push(activoOculto);
    const ocultos = sortedDirect.slice(DM_VISIBLES).filter(c => c.id !== activoOculto?.id);
    return { visibles, ocultos };
  }, [sortedDirect, search, dmMostrarTodos, activeChatId]);
  const dmOcultosNoLeidos = useMemo(() => dmRecorte.ocultos.filter(c => c.unreadCount > 0).length, [dmRecorte.ocultos]);
  const sortedGroups = useMemo(() => sorted.filter(c => c.type === "group"), [sorted]);

  // Cuenta CONVERSACIONES, no mensajes: el chip filtra conversaciones, y así el
  // número coincide con el del icono del topbar y con las filas que quedan al
  // activarlo. El desglose por mensajes está en el badge de cada fila.
  const unreadTotal = useMemo(() => conversations.filter((c) => c.unreadCount > 0).length, [conversations]);
  const archivedCount = useMemo(() => conversations.filter(c => isArchived(c.id)).length, [conversations, isArchived]);

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

  // ¿lo que se está arrastrando es un chat fijado? (habilita el reorden entre fijados)
  const draggedIsPinned = draggingChatId ? isPinned(draggingChatId) : false;

  // Soltar un fijado sobre otro fijado → mover el arrastrado a la posición del destino.
  const handleReorderDrop = (targetId: string) => {
    const dragged = draggingChatId;
    if (!dragged || dragged === targetId) return;
    if (!isPinned(dragged) || !isPinned(targetId)) return;
    const order = pinnedOrder.filter(id => id !== dragged);
    const to = order.indexOf(targetId);
    if (to === -1) return;
    order.splice(to, 0, dragged);
    onReorderPinned(order);
  };

  return (
    <div className="flex flex-col h-full bg-card/50 overflow-hidden">
      {/* Header — M3 tonal surface */}
      <div className="shrink-0 px-3 sm:px-4 pt-3 pb-2 space-y-2.5 bg-primary/[0.03]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <StatusPicker />
          </div>
          <div className="flex items-center gap-0.5">
            <BotonSilenciarCanal channel="messenger" className="h-9 w-9 sm:h-8 sm:w-8 hover:bg-primary/8" />
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8 rounded-full hover:bg-primary/8" title="Nuevo">
                <Plus className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl min-w-[180px]">
              <DropdownMenuItem onClick={onNewChat}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Nuevo mensaje
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onNewGroup}>
                <Users className="h-3.5 w-3.5 mr-2" /> Nuevo grupo
              </DropdownMenuItem>
            </DropdownMenuContent>
            </DropdownMenu>
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
        <div className="pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          {/* Solo en teléfono y solo si Maven no está instalada; en iPhone el push
              de mensajes no existe sin instalarla. Se puede posponer 7 días. */}
          <InstalarMaven variante="banner" className="mx-3 mb-2" />
          {/* Quick access section */}
          <CollapsibleSection label="Acceso Rápido" defaultOpen>
            <div className="flex flex-wrap gap-1.5 px-3 pb-1">
              {[
                { key: "all", icon: Home, label: "Todos", badge: 0, canBadge: false },
                { key: "unread", icon: Mail, label: "No leídos", badge: unreadTotal, canBadge: true },
                { key: "mentions", icon: AtSign, label: "Menciones", badge: mentionedIds.size, canBadge: true },
                { key: "pinned", icon: Star, label: "Fijados", badge: 0, canBadge: false },
                { key: "archived", icon: Archive, label: "Archivados", badge: archivedCount, canBadge: true },
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
                    {/* El hueco del badge se reserva SIEMPRE en los chips que pueden tenerlo
                        (invisible cuando es 0). El conteo de Menciones llega async unos
                        segundos después de montar (useMentionedConversations hace sus
                        propias consultas): si el badge aparecía de golpe, el chip se
                        ensanchaba y toda la fila flex-wrap se reacomodaba. */}
                    {item.canBadge && (
                      <Badge className={cn(
                        "h-4 min-w-4 px-1 text-[9px] bg-primary text-primary-foreground rounded-full font-bold",
                        item.badge === 0 && "invisible",
                      )}>
                        {item.badge > 99 ? "99+" : item.badge > 0 ? item.badge : 0}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </CollapsibleSection>

          {/* Secciones de conversaciones — estilo Google Chat: "Mensajes directos"
              y después "Grupos". En el tab Archivados va una sola sección combinada. */}
          {(() => {
            const renderConvs = (items: ConversationWithDetails[], emptyText: string) =>
              items.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground">{search ? "Sin resultados" : emptyText}</p>
                </div>
              ) : (
                items.map(conv => (
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
                    canReorderDrop={draggedIsPinned && isPinned(conv.id)}
                    onReorderDrop={() => handleReorderDrop(conv.id)}
                    isSystemAdmin={isAdmin}
                  />
                ))
              );

            const sectionHeader = (label: string, count: number, expanded: boolean, toggle: () => void) => (
              <button
                onClick={toggle}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors"
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span>{label}</span>
                {count > 0 && (
                  <span className="ml-auto text-[10px] font-normal normal-case text-muted-foreground/70">
                    {count}
                  </span>
                )}
              </button>
            );

            if (tab === "archived") {
              return (
                <div className="mt-1 px-2">
                  {sectionHeader("Archivados", sorted.length, dmExpanded, () => setDmExpanded(!dmExpanded))}
                  {dmExpanded && renderConvs(sorted, "No tienes chats archivados")}
                </div>
              );
            }
            return (
              <>
                <div className="mt-1 px-2">
                  {sectionHeader("Mensajes directos", sortedDirect.length, dmExpanded, () => setDmExpanded(!dmExpanded))}
                  {dmExpanded && renderConvs(dmRecorte.visibles, "Inicia una conversación")}
                  {/* Renglón "Mostrar todo / Mostrar menos", alineado como un chat
                      más (el ícono ocupa la columna del avatar). */}
                  {dmExpanded && !search.trim() && sortedDirect.length > DM_VISIBLES && (
                    <button
                      type="button"
                      onClick={() => setDmMostrarTodos(v => !v)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-2xl text-left text-sm text-muted-foreground hover:bg-primary/5 hover:text-foreground transition-colors"
                    >
                      <span className="hidden sm:block w-3 shrink-0" />
                      <span className="h-10 w-10 sm:h-9 sm:w-9 rounded-full bg-primary/5 flex items-center justify-center shrink-0">
                        {dmMostrarTodos ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
                      </span>
                      <span className="flex-1 min-w-0 truncate">
                        {dmMostrarTodos ? "Mostrar menos" : `Mostrar todo · ${dmRecorte.ocultos.length} más`}
                      </span>
                      {!dmMostrarTodos && dmOcultosNoLeidos > 0 && (
                        <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-primary text-primary-foreground rounded-full shrink-0 font-bold" title={`${dmOcultosNoLeidos} chats ocultos con mensajes sin leer`}>
                          {dmOcultosNoLeidos}
                        </Badge>
                      )}
                    </button>
                  )}
                </div>
                <div className="mt-1 px-2">
                  {sectionHeader("Grupos", sortedGroups.length, groupsExpanded, () => setGroupsExpanded(!groupsExpanded))}
                  {groupsExpanded && renderConvs(sortedGroups, "Sin grupos todavía")}
                </div>
              </>
            );
          })()}

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
                  const colorPersonal = getStatusColorPersonal(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => onSelectContact(p.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-[7px] min-h-[40px] sm:min-h-0 rounded-2xl text-left hover:bg-primary/5 transition-colors"
                    >
                      <div className="relative shrink-0">
                        <UserAvatar
                          name={p.full_name || "?"}
                          src={p.avatar_url}
                          seed={p.avatar_seed}
                          size="sm"
                          className="h-7 w-7"
                        />
                        <span className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-[1.5px] border-card",
                          getStatusColor(status, online, colorPersonal)
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
function ConversationItem({ conversation, isActive, onClick, onDelete, isPinned, onTogglePin, onArchive, isArchivedChat, onToggleMute, onDragStart, onDragEnd, canReorderDrop, onReorderDrop, isSystemAdmin }: {
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
  canReorderDrop?: boolean;
  onReorderDrop?: () => void;
  isSystemAdmin?: boolean;
}) {
  const { user } = useAuth();
  const [reorderOver, setReorderOver] = useState(false);
  const isGroup = conversation.type === "group";
  const { isOnline, getStatus, getStatusColorPersonal } = useOnlinePresence();
  const isMuted = conversation.participants.find(p => p.user_id === user?.id)?.is_muted ?? false;
  const handleToggleMute = () => onToggleMute(conversation.id, !isMuted);

  const otherParticipant = !isGroup
    ? conversation.participants.find(p => p.user_id !== user?.id)
    : null;
  const online = otherParticipant ? isOnline(otherParticipant.user_id) : false;
  const status = otherParticipant ? getStatus(otherParticipant.user_id) : null;
  const colorPersonal = otherParticipant ? getStatusColorPersonal(otherParticipant.user_id) : null;
  const hasUnread = conversation.unreadCount > 0;

  // Borrador pendiente (estilo WhatsApp): si dejaste un mensaje a medias en este
  // chat, la lista lo recuerda. En el chat activo no hace falta — lo estás viendo.
  const draft = !isActive ? getDraft(user?.id, conversation.id) : "";
  // Precedencia estilo WhatsApp: escribiendo > borrador > último mensaje. Se
  // sustituye el TEXTO del <p> que ya existe (ya trae truncate), así que no hay
  // renglón nuevo ni salto de alto ni el agujero de min-w-0 de #1602.
  const escribiendo = !!useTypingInbox().quienEscribe(conversation.id);
  const lastMsgPreview = escribiendo
    ? "escribiendo…"
    : draft
      ? `✏️ Borrador: ${draft}`
      : getMessagePreview(conversation, user?.id);

  // En el teléfono la fila NO es arrastrable: iOS trata el primer toque sobre un
  // elemento `draggable` como intento de arrastre y hacía falta tocar dos veces
  // para abrir el chat. Reordenar fijados es de escritorio (el agarre ya era
  // `hidden sm:block`).
  const arrastrable = !esTactil();
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          draggable={arrastrable}
          onDragStart={arrastrable ? onDragStart : undefined}
          onDragEnd={arrastrable ? () => { setReorderOver(false); onDragEnd(); } : undefined}
          onDragOver={arrastrable && canReorderDrop ? (e) => { e.preventDefault(); setReorderOver(true); } : undefined}
          onDragLeave={arrastrable && canReorderDrop ? () => setReorderOver(false) : undefined}
          onDrop={arrastrable && canReorderDrop ? (e) => { e.preventDefault(); setReorderOver(false); onReorderDrop?.(); } : undefined}
          onClick={onClick}
          className={cn(
            "w-full flex items-center gap-2.5 px-2.5 py-2.5 sm:py-2 rounded-2xl text-left transition-all duration-150 group relative",
            // Los :hover SOLO con mouse: en iOS, un hover que cambia algo hace que el
            // primer toque cuente como "pasar por encima" y el segundo como click.
            isActive
              ? "bg-primary/12 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-gradient-to-b before:from-accent before:to-primary"
              : "[@media(hover:hover)]:hover:bg-primary/5",
            // Sombreado del no-leído. 0.04 y después 0.09 seguían siendo casi invisibles,
            // sobre todo en modo claro. Se sube el tinte y además se marca con una barra
            // de acento a la izquierda (inset shadow, no empuja el layout): así se
            // distingue de un vistazo en claro y en oscuro.
            hasUnread && !isActive && "bg-primary/[0.16] shadow-[inset_3px_0_0_0_hsl(var(--primary))]",
            reorderOver && "ring-2 ring-primary/60 ring-inset"
          )}
        >
          {/* Drag handle */}
          <GripVertical className="h-3 w-3 text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab hidden sm:block" />

          {/* Avatar */}
          <div className="relative shrink-0">
            {isGroup ? (
              <Avatar className={cn("h-10 w-10 sm:h-9 sm:w-9", isActive && "ring-2 ring-primary/20")}>
                {conversation.avatar_url && <AvatarImage src={conversation.avatar_url} alt={conversation.displayName} className="object-cover" />}
                <AvatarFallback className="text-xs font-bold text-white bg-gradient-to-br from-violet-600 to-fuchsia-600">
                  <Users className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            ) : (
              <UserAvatar
                name={conversation.displayName}
                src={conversation.avatar_url || otherParticipant?.profile?.avatar_url}
                seed={otherParticipant?.profile?.avatar_seed}
                className={cn("h-10 w-10 sm:h-9 sm:w-9", isActive && "ring-2 ring-primary/20")}
              />
            )}
            {!isGroup && (
              <span className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                getStatusColor(status, online, colorPersonal)
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
                escribiendo
                  ? "text-primary font-medium"
                  : hasUnread ? "text-foreground font-medium" : "text-muted-foreground"
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
                // En táctil este ⋮ no se dibuja (las mismas acciones están en el menú
                // de mantener presionado); con mouse aparece al pasar por encima.
                className="absolute top-1.5 right-1.5 p-1 rounded-md opacity-0 [@media(hover:hover)]:group-hover:opacity-100 hover:bg-muted transition-opacity z-10 [@media(hover:none)]:hidden"
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
