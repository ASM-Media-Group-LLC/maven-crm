import { useMemo, useState } from "react";
import { Search, PenSquare, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useChatShared } from "@/hooks/ChatProvider";
import { useOnlinePresence, type UserStatus } from "@/hooks/useOnlinePresence";
import { getStatusColor } from "@/pages/messenger/components/StatusPicker";
import { formatTime, truncate, getMessagePreview } from "@/pages/messenger/preview";
import type { ConversationWithDetails } from "@/pages/messenger/types";

type Tab = "all" | "unread" | "groups";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "unread", label: "No leídos" },
  { id: "groups", label: "Grupos" },
];

/**
 * El panel "Chats": buscador, pestañas y lista de conversaciones.
 *
 * Lo usan DOS sitios con el mismo aspecto: la nube del topbar (dentro de su
 * popover) y el botón de Mensajes del muelle flotante (pegado al muelle). Por
 * eso vive suelto y no dentro de ninguno de los dos.
 */
export default function ChatsPanel({
  alto = 380, onAbrirChat, onNuevo, onVerTodo,
}: {
  /** Alto de la lista; el resto del panel es fijo. */
  alto?: number;
  onAbrirChat: (conversationId: string) => void;
  onNuevo: () => void;
  onVerTodo: () => void;
}) {
  const { user } = useAuth();
  const { conversations, loading } = useChatShared();
  const { isOnline, getStatus } = useOnlinePresence();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (q) {
        // Buscando se ignora la pestaña: escribir un nombre estando en "Grupos"
        // y que diga "sin resultados" cuando la persona existe es desconcertante.
        return c.displayName.toLowerCase().includes(q);
      }
      if (tab === "unread") return c.unreadCount > 0;
      if (tab === "groups") return c.type === "group";
      return true;
    });
  }, [conversations, tab, search]);

  return (
    <>
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <p className="text-lg font-bold">Chats</p>
        <Button
          variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
          title="Mensaje nuevo" onClick={onNuevo}
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
              tab === tb.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Altura FIJA, no max-h: radix necesita altura definida para que su
          viewport interno active el scrollbar (mismo detalle que la campana). */}
      <ScrollArea className="border-t" style={{ height: alto }}>
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
                onClick={() => onAbrirChat(c.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-2">
        <Button variant="ghost" size="sm" className="w-full text-xs font-semibold text-primary" onClick={onVerTodo}>
          Ver todo en Messenger
        </Button>
      </div>
    </>
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

      {/* Punto de no leído, como en Facebook: el número exacto vive en la lista grande. */}
      {hasUnread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
    </button>
  );
}
