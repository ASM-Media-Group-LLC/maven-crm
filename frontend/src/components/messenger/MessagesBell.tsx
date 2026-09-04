import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useChatShared } from "@/hooks/ChatProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { useMessengerDock } from "./MessengerDock";
import ChatsPanel from "./ChatsPanel";
import { BOTON_TOPBAR } from "@/components/dashboard/topbarStyles";

/**
 * Campana de MENSAJES del topbar (la nube), a la izquierda de la campana de
 * notificaciones. Los mensajes nuevos alumbran acá y ya no en la campana: el
 * 95% de lo que llegaba a la campana eran mensajes y tapaban las
 * notificaciones de verdad (vencimientos de closers, evaluaciones…).
 *
 * El panel es el mismo <ChatsPanel> que abre el botón del muelle flotante.
 */
export default function MessagesBell() {
  const navigate = useNavigate();
  const { conversations } = useChatShared();
  const { canAccess } = usePermissions();
  const { abrirChat } = useMessengerDock();
  const [open, setOpen] = useState(false);

  const total = useMemo(
    () => conversations.reduce((s, c) => s + c.unreadCount, 0),
    [conversations],
  );

  // Sin acceso al Messenger no tiene sentido el icono (la ruta /messenger ya
  // está detrás del mismo permiso).
  if (!canAccess("Messenger")) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={BOTON_TOPBAR} title="Mensajes">
          <MessageCircle className="h-[18px] w-[18px]" />
          {total > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
              {total > 9 ? "9+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      {/* Mismo material que el panel del muelle: es literalmente el mismo panel. */}
      <PopoverContent align="end" className="glass-panel w-[calc(100vw-1rem)] max-w-[360px] rounded-2xl p-0">
        <ChatsPanel
          // Como en Facebook: al tocar una conversación se abre la VENTANITA del
          // muelle, no te saca de la pantalla en la que estás. (En el teléfono, o
          // si ya estás en /messenger, el muelle navega en su lugar.)
          onAbrirChat={(id) => { setOpen(false); abrirChat(id); }}
          onNuevo={() => { setOpen(false); navigate("/messenger?nuevo=1"); }}
          onVerTodo={() => { setOpen(false); navigate("/messenger"); }}
          onCerrar={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
