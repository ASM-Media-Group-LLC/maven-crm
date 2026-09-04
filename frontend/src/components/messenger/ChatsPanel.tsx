import { useMemo, useState } from "react";
import { Search, PenSquare, Users, X } from "lucide-react";
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

/** ⚠️ DICEBEAR: el muñequito llega envuelto en el anillo degradé de
 *  UserAvatar (+4px por lado), así que mide 40px donde unas iniciales miden
 *  32 y las filas quedaban dentadas. El hueco se reserva SIEMPRE de 40 y el
 *  avatar se centra dentro, tenga muñequito o no.
 *
 *  ⚠️ El punto de presencia NO puede colgarse de este hueco: con iniciales
 *  (32px dentro de 40) quedaba 4px despegado, flotando en la esquina de la
 *  caja. Va dentro de ANCLA_AVATAR, que se ajusta al avatar real. */
const HUECO_AVATAR = "flex h-10 w-10 shrink-0 items-center justify-center";
const ANCLA_AVATAR = "relative inline-flex";

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
  alto = 380, onAbrirChat, onNuevo, onVerTodo, onCerrar,
}: {
  /** Alto de la lista; el resto del panel es fijo. */
  alto?: number;
  onAbrirChat: (conversationId: string) => void;
  onNuevo: () => void;
  onVerTodo: () => void;
  /** Cierra el panel. Si no se pasa, no se dibuja la X (el contenedor se
   *  encarga). Existe porque cerrar clickeando afuera es un gesto invisible:
   *  no se ve cómo salir. */
  onCerrar?: () => void;
}) {
  const { user } = useAuth();
  const { conversations, loading, profiles, createDirectChat } = useChatShared();
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

  // Buscar a CUALQUIERA del equipo, tenga chat o no. Antes el buscador solo
  // filtraba conversaciones existentes: alguien con quien nunca hablaste
  // simplemente no aparecía y había que ir a Messenger a crear el chat.
  // Se excluye a uno mismo y a quien ya salió arriba como chat directo, para no
  // mostrar a la misma persona dos veces.
  const personas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const yaConChat = new Set<string>();
    for (const c of conversations) {
      if (c.type !== "direct") continue;
      for (const p of c.participants) if (p.user_id !== user?.id) yaConChat.add(p.user_id);
    }
    return Object.values(profiles)
      .filter((p) => p.id !== user?.id && !yaConChat.has(p.id) &&
        (p.full_name ?? "").toLowerCase().includes(q))
      .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""))
      .slice(0, 8);
  }, [search, profiles, conversations, user]);

  const abrirConPersona = (userId: string) => {
    // createDirectChat reusa la conversación si ya existía y si no la crea
    // optimista, así que devuelve un id usable al instante.
    const id = createDirectChat(userId);
    if (id) onAbrirChat(id);
  };

  return (
    <>
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <p className="text-lg font-bold">Chats</p>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
            title="Mensaje nuevo" onClick={onNuevo}
          >
            <PenSquare className="h-4 w-4" />
          </Button>
          {onCerrar && (
            <Button
              variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
              title="Cerrar" aria-label="Cerrar" onClick={onCerrar}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
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
      <ScrollArea className="border-t border-border/40" style={{ height: alto }}>
        {loading ? (
          <p className="p-4 text-center text-xs text-muted-foreground">Cargando…</p>
        ) : visibles.length === 0 && personas.length === 0 ? (
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

            {personas.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Otras personas
                </p>
                {personas.map((p) => (
                  <FilaPersona
                    key={p.id}
                    perfil={p}
                    online={isOnline(p.id)}
                    estado={getStatus(p.id)}
                    onClick={() => abrirConPersona(p.id)}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-border/40 p-2">
        <Button variant="ghost" size="sm" className="w-full text-xs font-semibold text-primary" onClick={onVerTodo}>
          Ver todo en Messenger
        </Button>
      </div>
    </>
  );
}

/** Alguien del equipo con quien todavía no hay chat: al tocarlo se crea. */
function FilaPersona({
  perfil, online, estado, onClick,
}: {
  perfil: { id: string; full_name?: string | null; avatar_url?: string | null; avatar_seed?: string | null };
  online: boolean;
  estado: UserStatus | null;
  onClick: () => void;
}) {
  const nombre = perfil.full_name || "Sin nombre";
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/60 active:scale-[.985]"
    >
      <div className={HUECO_AVATAR}>
        <span className={ANCLA_AVATAR}>
        <UserAvatar name={nombre} src={perfil.avatar_url} seed={perfil.avatar_seed ?? undefined} size="sm" />
        <span
          className={cn(
            "presence-ring absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-popover",
            getStatusColor(estado, online),
            online && "animate-presence-pulse motion-reduce:animate-none",
          )}
        />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{nombre}</p>
        <p className="truncate text-xs text-muted-foreground">Enviar mensaje</p>
      </div>
      {/* La acción se nombra al pasar por encima: deja claro que tocar acá
          ABRE una conversación nueva, no busca dentro de una que ya existe. */}
      <span className="shrink-0 text-[11px] font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
        Escribir
      </span>
    </button>
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
      className="group relative flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/60 active:scale-[.985]"
    >
      {/* Lo no leído en el canto IZQUIERDO, donde entra la vista, y no en un
          punto de 10px al final de la fila. Va junto al nombre en negrita y la
          hora en color: tres señales que apuntan a lo mismo. */}
      {hasUnread && (
        <span className="pointer-events-none absolute inset-y-3 left-0.5 w-[3px] rounded-full bg-primary" />
      )}
      <div className={HUECO_AVATAR}>
        {isGroup ? (
          <Avatar className="h-8 w-8">
            {conversation.avatar_url && (
              <AvatarImage src={conversation.avatar_url} alt={conversation.displayName} className="object-cover" />
            )}
            <AvatarFallback className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-xs font-bold text-white">
              <Users className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className={ANCLA_AVATAR}>
            {/* El tamaño por `size` (ver la nota en DockChatWindow). */}
            <UserAvatar
              name={conversation.displayName}
              src={conversation.avatar_url || otro?.profile?.avatar_url}
              seed={otro?.profile?.avatar_seed}
              size="sm"
            />
            <span
              className={cn(
                "presence-ring absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-popover",
                getStatusColor(
                  otro ? status(otro.user_id) : null,
                  otro ? online(otro.user_id) : false,
                ),
                otro && online(otro.user_id) && "animate-presence-pulse motion-reduce:animate-none",
              )}
            />
          </span>
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

    </button>
  );
}
