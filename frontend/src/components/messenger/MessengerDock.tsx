import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageCircle, X, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { useChatShared } from "@/hooks/ChatProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMuelleFlotante, FAB_SIZE, MARGIN, MUELLE_EXTRA_ID } from "@/hooks/useMuelleFlotante";
import ClariAiFab from "@/components/ClariAiFab";
import { useUserRole } from "@/hooks/useUserRole";
import DockChatWindow, { VENTANA_ANCHO } from "./DockChatWindow";
import ChatsPanel from "./ChatsPanel";
import type { ConversationWithDetails } from "@/pages/messenger/types";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

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
  const { t } = useLanguage();
  const { canAccess } = usePermissions();
  const { isAdmin } = useUserRole();
  const { conversations } = useChatShared();
  const { pos, estiloContenedor, arrastreProps, anclarPanel } = useMuelleFlotante();

  // ids abiertos; el primero es el más a la derecha (pegado al muelle).
  const [abiertas, setAbiertas] = useState<string[]>([]);
  const [minimizadas, setMinimizadas] = useState<string[]>([]);
  const [panelAbierto, setPanelAbierto] = useState(false);
  // Teléfono: la conversación abierta desde la nube, en una hoja encima de la
  // pantalla (las ventanitas de escritorio no entran en 390 px).
  const [chatEnHoja, setChatEnHoja] = useState<string | null>(null);

  const enMessenger = location.pathname.startsWith("/messenger");
  const puedeMessenger = canAccess("Messenger");
  // En /messenger la parte de Messenger del muelle desaparece: ya estás ahí.
  // Clari se queda, que no tiene nada que ver.
  // En el teléfono la nube vive SOLO en Cowork (Jhon, 10/09: "mandar mensajes
  // sin salir de Cowork"): en las demás pantallas móviles taparía composers y
  // botones de abajo. En escritorio, en todas como siempre.
  const enCowork = location.pathname.startsWith("/cowork");
  const mostrarMessenger = puedeMessenger && !enMessenger && (!isMobile || enCowork);
  // En el teléfono, dentro del Messenger, el botón de Clari se montaba sobre la
  // barra del composer (grabar nota de voz quedaba debajo). Ahí no va.
  const mostrarClari = isAdmin && !(isMobile && enMessenger);

  const abrirChat = useCallback((id: string) => {
    // En el teléfono las ventanitas no tienen sentido: vamos a la pantalla.
    // Y YA EN /messenger tampoco: ahí las ventanitas no se dibujan, así que abrir
    // una era no hacer nada — Jhon tocó a María en la nube desde Messenger y el
    // chat no se abrió (16/09). La página ya sabe seleccionar por ?c=.
    if (isMobile || !puedeMessenger || enMessenger) { navigate(`/messenger?c=${id}`); return; }
    setMinimizadas((m) => m.filter((x) => x !== id));
    setAbiertas((a) => (a.includes(id) ? a : [id, ...a].slice(0, MAX_ABIERTAS)));
  }, [isMobile, puedeMessenger, enMessenger, navigate]);

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

  // CHATS sin leer, igual que la nube del topbar (ver MessagesBell).
  const sinLeer = useMemo(
    () => conversations.filter((c) => c.unreadCount > 0).length,
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
          <div className={cn("fixed inset-0 z-40", isMobile && "bg-black/40")} onClick={() => setPanelAbierto(false)} aria-hidden />
          <div
            className={cn(
              "glass-panel fixed z-50 flex flex-col overflow-hidden text-popover-foreground",
              // Teléfono: hoja inferior a lo ancho; escritorio: pegado al muelle.
              isMobile ? "inset-x-0 bottom-0 rounded-t-2xl pb-safe" : "w-[360px] rounded-2xl",
            )}
            style={isMobile ? undefined : { ...anclarPanel(360, 520), width: 360 }}
            role="dialog"
            aria-label="Chats"
          >
            <ChatsPanel
              alto={isMobile ? 360 : 330}
              // En el teléfono el chat se abre en una hoja encima, sin salir de la
              // pantalla; en escritorio, en su ventanita junto al muelle.
              onAbrirChat={(id) => { setPanelAbierto(false); if (isMobile) setChatEnHoja(id); else abrirChat(id); }}
              onNuevo={() => { setPanelAbierto(false); navigate("/messenger?nuevo=1"); }}
              onVerTodo={() => { setPanelAbierto(false); navigate("/messenger"); }}
              onCerrar={() => setPanelAbierto(false)}
            />
          </div>
        </>
      )}

      {/* Teléfono: la conversación abierta desde la nube, en una hoja que ocupa
          casi toda la pantalla. "Minimizar" vuelve a la lista; cerrar la cierra.
          Es la misma DockChatWindow del escritorio (MessageList + MessageInput
          completos), solo que llena la hoja en vez de medir 336 px. */}
      {mostrarMessenger && isMobile && chatEnHoja && porId[chatEnHoja] && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setChatEnHoja(null)} aria-hidden />
          <div className="fixed inset-x-0 bottom-0 z-50 h-[85dvh] pb-safe">
            <DockChatWindow
              conversation={porId[chatEnHoja]}
              llenar
              onMinimize={() => { setChatEnHoja(null); setPanelAbierto(true); }}
              onClose={() => setChatEnHoja(null)}
            />
          </div>
        </>
      )}

      {/* La COLUMNA: burbujas arriba, Mensajes al medio, Clari abajo
          (flex-col-reverse: el primer hijo queda abajo). Se arrastra entera; el
          umbral de 5px distingue mover de hacer clic. Si no hay nada que
          mostrar no se dibuja, para no dejar un contenedor invisible que
          capture punteros. */}
      {(mostrarClari || mostrarMessenger) && (
      <div
        className="fixed z-50 flex touch-none cursor-grab flex-col-reverse items-center gap-2 active:cursor-grabbing"
        style={estiloContenedor}
        {...arrastreProps}
      >
        {mostrarClari && <ClariAiFab anclarPanel={anclarPanel} />}

        {mostrarMessenger && (
          <button
            type="button"
            onClick={() => setPanelAbierto((v) => !v)}
            className="glass-panel relative flex h-14 w-14 items-center justify-center rounded-full text-foreground transition-transform hover:scale-105 active:scale-95"
            title={t("messenger.dock.mensajesArrastrame")}
            aria-expanded={panelAbierto}
            aria-label={t("messenger.dock.mensajes")}
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

        {/* Ancla para lo que otras pantallas cuelgan encima de la nubecita (el
            «Hub» minimizado de Cowork). Mide lo mismo que una burbuja y nada de
            alto: lo que llegue por portal se posiciona absoluto sobre ella y
            NO ensancha la pila (con `contents` una píldora más ancha corría las
            burbujas). `data-lado` dice de qué lado de la pantalla está el
            muelle, para que lo colgado se alinee hacia adentro. */}
        <div id={MUELLE_EXTRA_ID} data-lado={haciaIzquierda ? "derecha" : "izquierda"} className="relative h-0 w-14" />
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
  const { t } = useLanguage();
  const isGroup = conversation.type === "group";
  const otro = isGroup ? undefined : conversation.participants.find((p) => p.user_id !== user?.id);
  const sinLeer = conversation.unreadCount;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="block rounded-full shadow-[0_10px_28px_-8px_hsl(228_40%_6%_/_.45)] ring-1 ring-border/50 transition-transform hover:scale-105 active:scale-95"
        title={conversation.displayName}
        aria-label={t("messenger.mention.abrirChatCon", { name: conversation.displayName })}
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
            size="lg"
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
        title={t("messenger.thread.quitar")}
        aria-label={t("messenger.dock.quitarChatCon", { name: conversation.displayName })}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
