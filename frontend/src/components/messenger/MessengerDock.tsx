import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageCircle, X, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { useChatShared } from "@/hooks/ChatProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMuelleFlotante, FAB_SIZE, MARGIN } from "@/hooks/useMuelleFlotante";
import ClariAiFab from "@/components/ClariAiFab";
import { useUserRole } from "@/hooks/useUserRole";
import DockChatWindow, { VENTANA_ANCHO } from "./DockChatWindow";
import ChatsPanel from "./ChatsPanel";
import type { ConversationWithDetails } from "@/pages/messenger/types";
import { cn } from "@/lib/utils";

/** Tope duro de ventanas abiertas; abajo se recorta además por ancho real. */
const MAX_ABIERTAS = 3;

/** Cuántas ventanas entran de verdad al lado del muelle sin salirse. */
const cuantasEntran = (anchoDisponible: number) =>
  Math.max(1, Math.min(MAX_ABIERTAS, Math.floor(anchoDisponible / (VENTANA_ANCHO + MARGIN))));

interface DockApi {
  /** Abre (o restaura) la ventanita de una conversación. */
  abrirChat: (conversationId: string) => void;
}

const DockContext = createContext<DockApi>({ abrirChat: () => {} });

/** Para que cualquier pantalla pueda abrir un chat en el muelle. */
export const useMessengerDock = () => useContext(DockContext);

export function MessengerDockProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { canAccess } = usePermissions();
  const { isAdmin } = useUserRole();
  const { conversations } = useChatShared();
  const { pos, estiloContenedor, arrastreProps, anclarPanel } = useMuelleFlotante();

  // ids abiertos; el primero es el más a la derecha (pegado al muelle).
  const [abiertas, setAbiertas] = useState<string[]>([]);
  const [minimizadas, setMinimizadas] = useState<string[]>([]);
  const [panelAbierto, setPanelAbierto] = useState(false);

  const enMessenger = location.pathname.startsWith("/messenger");
  const puedeMessenger = canAccess("Messenger");
  // En /messenger la parte de Messenger del muelle desaparece: ya estás ahí.
  // Clari se queda, que no tiene nada que ver.
  const mostrarMessenger = puedeMessenger && !enMessenger && !isMobile;

  const abrirChat = useCallback((id: string) => {
    // En el teléfono las ventanitas no tienen sentido: vamos a la pantalla.
    if (isMobile || !puedeMessenger) { navigate(`/messenger?c=${id}`); return; }
    setMinimizadas((m) => m.filter((x) => x !== id));
    setAbiertas((a) => (a.includes(id) ? a : [id, ...a].slice(0, MAX_ABIERTAS)));
  }, [isMobile, puedeMessenger, navigate]);

  const cerrar = useCallback((id: string) => {
    setAbiertas((a) => a.filter((x) => x !== id));
    setMinimizadas((m) => m.filter((x) => x !== id));
  }, []);

  const minimizar = useCallback((id: string) => {
    setAbiertas((a) => a.filter((x) => x !== id));
    setMinimizadas((m) => (m.includes(id) ? m : [id, ...m]));
  }, []);

  const porId = useMemo(() => {
    const m: Record<string, ConversationWithDetails> = {};
    for (const c of conversations) m[c.id] = c;
    return m;
  }, [conversations]);

  const sinLeer = useMemo(
    () => conversations.reduce((s, c) => s + c.unreadCount, 0),
    [conversations],
  );

  // Las ventanas se abren hacia el lado con espacio: si el muelle está parkeado
  // en la mitad derecha crecen hacia la izquierda, y al revés.
  const haciaIzquierda = typeof window !== "undefined" && pos.x > window.innerWidth / 2;
  const estiloVentanas = {
    bottom: estiloContenedor.bottom,
    ...(haciaIzquierda
      ? { right: (typeof window === "undefined" ? 0 : window.innerWidth) - pos.x + MARGIN }
      : { left: pos.x + FAB_SIZE + MARGIN }),
  } as React.CSSProperties;

  // En una pantalla angosta no entran tres ventanas de 336px: mostramos las que
  // quepan (las más recientes) y el resto sigue abierto, solo que no se dibuja.
  const anchoLibre = typeof window === "undefined"
    ? 0
    : (haciaIzquierda ? pos.x : window.innerWidth - pos.x - FAB_SIZE) - 2 * MARGIN;
  const ventanas = abiertas
    .map((id) => porId[id])
    .filter(Boolean)
    .slice(0, cuantasEntran(anchoLibre));

  return (
    <DockContext.Provider value={{ abrirChat }}>
      {children}

      {mostrarMessenger && ventanas.length > 0 && (
        <div
          className="pointer-events-none fixed z-50 flex items-end gap-2"
          style={estiloVentanas}
        >
          {ventanas.map((c) => (
            <DockChatWindow
              key={c.id}
              conversation={c}
              onMinimize={() => minimizar(c.id)}
              onClose={() => cerrar(c.id)}
            />
          ))}
        </div>
      )}

      {/* Panel de chats pegado al muelle. El botón NO navega: desde acá se
          manda un mensaje sin salir de la pantalla, que es lo que se pidió. */}
      {mostrarMessenger && panelAbierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPanelAbierto(false)} aria-hidden />
          <div
            className="fixed z-50 flex w-[360px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-popover text-popover-foreground shadow-2xl ring-1 ring-black/5"
            style={{ ...anclarPanel(360, 520), width: 360 }}
            role="dialog"
            aria-label="Chats"
          >
            <ChatsPanel
              alto={330}
              onAbrirChat={(id) => { setPanelAbierto(false); abrirChat(id); }}
              onNuevo={() => { setPanelAbierto(false); navigate("/messenger?nuevo=1"); }}
              onVerTodo={() => { setPanelAbierto(false); navigate("/messenger"); }}
            />
          </div>
        </>
      )}

      {/* La COLUMNA: burbujas arriba, Mensajes al medio, Clari abajo
          (flex-col-reverse: el primer hijo queda abajo). Se arrastra entera; el
          umbral de 5px distingue mover de hacer clic. Si no hay nada que
          mostrar no se dibuja, para no dejar un contenedor invisible que
          capture punteros. */}
      {(isAdmin || mostrarMessenger) && (
      <div
        className="fixed z-50 flex touch-none cursor-grab flex-col-reverse items-center gap-2 active:cursor-grabbing"
        style={estiloContenedor}
        {...arrastreProps}
      >
        {isAdmin && <ClariAiFab anclarPanel={anclarPanel} />}

        {mostrarMessenger && (
          <button
            type="button"
            onClick={() => setPanelAbierto((v) => !v)}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-card text-foreground shadow-lg ring-1 ring-border/60 transition-shadow hover:shadow-xl"
            title="Mensajes — arrastrame para moverme"
            aria-expanded={panelAbierto}
            aria-label="Mensajes"
          >
            <MessageCircle className="h-6 w-6" />
            {sinLeer > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
                {sinLeer > 99 ? "99+" : sinLeer}
              </span>
            )}
          </button>
        )}

        {mostrarMessenger && minimizadas.map((id) => {
          const c = porId[id];
          if (!c) return null;
          return <Burbuja key={id} conversation={c} onOpen={() => abrirChat(id)} onClose={() => cerrar(id)} />;
        })}
      </div>
      )}
    </DockContext.Provider>
  );
}

function Burbuja({
  conversation, onOpen, onClose,
}: {
  conversation: ConversationWithDetails;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const isGroup = conversation.type === "group";
  const otro = isGroup ? undefined : conversation.participants.find((p) => p.user_id !== user?.id);
  const sinLeer = conversation.unreadCount;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="block rounded-full shadow-lg ring-2 ring-background transition-transform hover:scale-105"
        title={conversation.displayName}
        aria-label={`Abrir chat con ${conversation.displayName}`}
      >
        {isGroup ? (
          <Avatar className="h-12 w-12">
            {conversation.avatar_url && (
              <AvatarImage src={conversation.avatar_url} alt={conversation.displayName} className="object-cover" />
            )}
            <AvatarFallback className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
              <Users className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
        ) : (
          <UserAvatar
            name={conversation.displayName}
            src={conversation.avatar_url || otro?.profile?.avatar_url}
            seed={otro?.profile?.avatar_seed}
            className="h-12 w-12"
          />
        )}
      </button>
      {sinLeer > 0 && (
        <span className={cn(
          "pointer-events-none absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center",
          "rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-background",
        )}>
          {sinLeer > 99 ? "99+" : sinLeer}
        </span>
      )}
      <button
        type="button"
        onClick={onClose}
        className="absolute -left-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border group-hover:flex"
        title="Quitar"
        aria-label={`Quitar el chat con ${conversation.displayName}`}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
