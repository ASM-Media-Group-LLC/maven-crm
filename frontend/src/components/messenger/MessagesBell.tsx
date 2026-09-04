import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Search, PenSquare, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useChatShared } from "@/hooks/ChatProvider";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { getStatusColor } from "@/pages/messenger/components/StatusPicker";
import type { UserStatus } from "@/hooks/useOnlinePresence";
import { formatTime, truncate, getMessagePreview } from "@/pages/messenger/preview";
import type { ConversationWithDetails } from "@/pages/messenger/types";

type Tab = "all" | "unread" | "groups";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "unread", label: "No leídos" },
  { id: "groups", label: "Grupos" },
];

/**
 * Campana de MENSAJES del topbar (la nube), a la izquierda de la campana de
 * notificaciones. Los mensajes nuevos alumbran acá y ya no en la campana: el
 * 95% de lo que llegaba a la campana eran mensajes y tapaban las
 * notificaciones de verdad (vencimientos de closers, evaluaciones…).
 */
export default function MessagesBell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { conversations, loading } = useChatShared();
  const { canAccess } = usePermissions();
  const { isOnline, getStatus } = useOnlinePresence();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");

  const total = useMemo(
    () => conversations.reduce((s, c) => s + c.unreadCount, 0),
    [conversations],
  );

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (q && !c.displayName.toLowerCase().includes(q)) return false;
      if (tab === "unread") return c.unreadCount > 0;
      if (tab === "groups") return c.type === "group";
      return true;
    });
  }, [conversations, tab, search]);

  const abrir = (id: string) => {
    setOpen(false);
    navigate(`/messenger?c=${id}`);
  };

  // Sin acceso al Messenger no tiene sentido el icono (la ruta /messenger ya
  // está detrás del mismo permiso).
  if (!canAccess("Messenger")) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground" title="Mensajes">
          <MessageCircle className="h-5 w-5" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {total > 9 ? "9+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <p className="text-lg font-bold">Chats</p>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            title="Mensaje nuevo"
            onClick={() => { setOpen(false); navigate("/messenger?nuevo=1"); }}
          >
            <PenSquare className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en Messenger"
              className="h-9 rounded-full bg-muted/60 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-1.5 px-3 pb-2">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                tab === tb.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Altura FIJA, no max-h: radix necesita altura definida para que su
            viewport interno active el scrollbar (mismo detalle que la campana). */}
        <ScrollArea className="h-[380px] border-t">
          {loading ? (
            <p className="p-4 text-center text-xs text-muted-foreground">Cargando…</p>
          ) : visibles.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {search ? "Sin resultados" : tab === "unread" ? "No tienes mensajes sin leer" : "Sin conversaciones"}
            </p>
          ) : (
            <div className="p-1.5">
              {visibles.slice(0, 50).map((c) => (
                <FilaChat
                  key={c.id}
                  conversation={c}
                  userId={user?.id}
                  online={isOnline}
                  status={getStatus}
                  onClick={() => abrir(c.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs font-semibold text-primary"
            onClick={() => { setOpen(false); navigate("/messenger"); }}
          >
            Ver todo en Messenger
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilaChat({
  conversation, userId, online, status, onClick,
}: {
  conversation: ConversationWithDetails;
  userId: string | undefined;
  online: (id: string) => boolean;
  status: (id: string) => UserStatus | null;
  onClick: () => void;
}) {
  const isGroup = conversation.type === "group";
  const otro = isGroup ? undefined : conversation.participants.find((p) => p.user_id !== userId);
  const hasUnread = conversation.unreadCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/60"
    >
      <div className="relative shrink-0">
        {isGroup ? (
          <Avatar className="h-9 w-9">
            {conversation.avatar_url && (
              <AvatarImage src={conversation.avatar_url} alt={conversation.displayName} className="object-cover" />
            )}
            <AvatarFallback className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-xs font-bold text-white">
              <Users className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        ) : (
          <>
            <UserAvatar
              name={conversation.displayName}
              src={conversation.avatar_url || otro?.profile?.avatar_url}
              seed={otro?.profile?.avatar_seed}
              className="h-9 w-9"
            />
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-popover",
                getStatusColor(
                  otro ? status(otro.user_id) : null,
                  otro ? online(otro.user_id) : false,
                ),
              )}
            />
          </>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-sm", hasUnread ? "font-bold text-foreground" : "font-medium text-foreground")}>
            {conversation.displayName}
          </span>
          <span className={cn("shrink-0 text-[10px]", hasUnread ? "font-semibold text-primary" : "text-muted-foreground")}>
            {formatTime(conversation.lastMessage?.created_at)}
          </span>
        </div>
        <p className={cn("truncate text-xs", hasUnread ? "font-medium text-foreground" : "text-muted-foreground")}>
          {truncate(getMessagePreview(conversation, userId), 40)}
        </p>
      </div>

      {/* Punto azul, como en Facebook: el número exacto vive en la lista grande. */}
      {hasUnread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
    </button>
  );
}
