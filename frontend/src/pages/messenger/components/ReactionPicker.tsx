import { useState } from "react";
import { Plus, SmilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import SelectorDeEmojis from "@/components/chat/SelectorDeEmojis";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import { useReaccionesRecientes, useSincronizarReacciones } from "../reaccionesRecientes";

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  className?: string;
}

// La barra de reacciones de cada mensaje, como la de WhatsApp: ocho emojis (lo
// último con que reaccionaste primero, el resto los de siempre) y al final un
// «+» que cambia la barra por el selector completo, en el mismo panel. Lo que
// elijas ahí entra a la barra para la próxima (ver reaccionesRecientes.ts).
export default function ReactionPicker({ onSelect, className }: ReactionPickerProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [completo, setCompleto] = useState(false);
  useSincronizarReacciones(user?.id);

  const cambiarAbierto = (abierto: boolean) => {
    setOpen(abierto);
    if (!abierto) setCompleto(false);
  };

  return (
    <Popover open={open} onOpenChange={cambiarAbierto}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-6 w-6 rounded-full", className)}
          title={t("messenger.reacciones.reaccionar")}
          aria-label={t("messenger.reacciones.reaccionar")}
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={completo ? "flex h-[min(25rem,70vh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col p-2" : "w-auto p-1.5"}
        side="top"
        align="center"
        collisionPadding={8}
      >
        {/* Solo se monta con el panel abierto: con un mensaje por burbuja, leer
            el historial en cada una sería leerlo cientos de veces. */}
        <Reacciones
          uid={user?.id}
          completo={completo}
          onVerTodos={() => setCompleto(true)}
          onElegir={(emoji) => { onSelect(emoji); cambiarAbierto(false); }}
        />
      </PopoverContent>
    </Popover>
  );
}

function Reacciones({ uid, completo, onVerTodos, onElegir }: {
  uid: string | undefined;
  completo: boolean;
  onVerTodos: () => void;
  onElegir: (emoji: string) => void;
}) {
  const { t } = useLanguage();
  const { barra, frecuentes, anotar } = useReaccionesRecientes(uid);
  const elegir = (emoji: string) => { anotar(emoji); onElegir(emoji); };

  if (completo) {
    return (
      <SelectorDeEmojis
        className="flex-1"
        frecuentes={frecuentes}
        onElegir={elegir}
        // Con mouse, a escribir de una. En táctil abriría el teclado encima.
        enfocarBusqueda={typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches}
      />
    );
  }

  return (
    <div className="flex gap-0.5">
      {barra.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-control text-lg transition-colors hover:bg-muted"
          onClick={() => elegir(emoji)}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={onVerTodos}
        title={t("messenger.reacciones.otro")}
        aria-label={t("messenger.reacciones.otro")}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
