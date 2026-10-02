import { Forward, Languages, MailWarning, MessageSquareShare, MoreVertical, Reply, Trash2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

/** Lo que se puede hacer con UN mensaje de la conversación. */
export interface AccionesDelMensaje {
  onResponder: () => void;
  onReenviar: () => void;
  onCompartir: () => void;
  onEliminar: () => void;
  onNoLeidoDesdeAqui: () => void;
  onTraducir: () => void;
}

/** El ⋮ de cada mensaje de una conversación abierta, como el de Gmail: se usa
 *  sin tener que abrir (seleccionar) ese mensaje antes.
 *
 *  Keila eligió EXACTAMENTE estas seis opciones (02/10); el orden es el de
 *  Gmail. Qué hace cada una lo decide quien lo dibuja: acá solo se elige. */
export default function MenuDelMensaje({
  acciones, ocupado, className,
}: {
  acciones: AccionesDelMensaje;
  /** Mientras se trae el mensaje para responder o reenviar. */
  ocupado?: boolean;
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("mail.msg.options")}
          title={t("mail.msg.options")}
          disabled={ocupado}
          // Que tocar el ⋮ no abra también el mensaje (la fila es un botón al lado).
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
            className,
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      {/* w-72: «Marcar como no leído a partir de aquí» en un solo renglón. */}
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem onSelect={acciones.onResponder}>
          <Reply className="mr-2 h-4 w-4" />
          {t("common.reply")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={acciones.onReenviar}>
          <Forward className="mr-2 h-4 w-4" />
          {t("mail.forward")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={acciones.onCompartir}>
          <MessageSquareShare className="mr-2 h-4 w-4" />
          {t("mail.msg.shareChat")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={acciones.onEliminar}>
          <Trash2 className="mr-2 h-4 w-4" />
          {t("common.delete")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={acciones.onNoLeidoDesdeAqui}>
          <MailWarning className="mr-2 h-4 w-4" />
          {t("mail.msg.unreadFromHere")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={acciones.onTraducir}>
          <Languages className="mr-2 h-4 w-4" />
          {t("mail.msg.translate")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
