// Reacciones con emoji en el Correo, como Gmail (Keila, 08/10/2026; captura de
// Gmail): una carita en el encabezado del mensaje y otra en la barra de
// Responder / Reenviar; abren el selector de emojis (buscador, categorías y los
// usados hace poco, los mismos del Messenger), y las reacciones se ven como
// chips debajo del mensaje.
//
// Lo que se manda es un correo de verdad, con el formato de Gmail
// (mail-fetch/reacciones.ts): por eso no se puede «des-reaccionar».

import { useState } from "react";
import { Loader2, SmilePlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import SelectorDeEmojis from "@/components/chat/SelectorDeEmojis";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import { useReaccionesRecientes } from "@/pages/messenger/reaccionesRecientes";
import type { ChipDeReaccion, PuedeReaccionar } from "@/lib/correo/reacciones";
import type { TranslationKey } from "@/lib/i18n";

const MOTIVO: Record<Exclude<PuedeReaccionar, { ok: true }>["motivo"], TranslationKey> = {
  sin_id: "mail.react.sinId",
  no_estas: "mail.react.noEstas",
  muchos: "mail.react.muchos",
};

/** La carita. `pildora`: la de la barra de Responder (redonda, con borde, del
 *  alto de los otros botones); `icono`: la del encabezado del mensaje. */
export function BotonReaccionar({ puede, onElegir, enviando = false, variante }: {
  puede: PuedeReaccionar;
  onElegir: (emoji: string) => void;
  enviando?: boolean;
  variante: "icono" | "pildora";
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const titulo = "motivo" in puede ? t(MOTIVO[puede.motivo]) : t("mail.react.add");

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!puede.ok || enviando}
          title={titulo}
          aria-label={t("mail.react.add")}
          className={cn(
            "inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
            variante === "icono"
              ? "-mt-1 h-8 w-8 rounded-full hover:bg-muted"
              : "h-9 w-9 rounded-full border border-input bg-background hover:bg-muted",
            "data-[state=open]:bg-primary/10 data-[state=open]:text-primary",
          )}
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <SmilePlus className="h-4 w-4" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="flex h-[min(25rem,70vh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col p-2"
        side="top"
        align={variante === "icono" ? "end" : "start"}
        collisionPadding={8}
      >
        {/* Solo se monta abierto: leer los recientes en cada mensaje no hace falta. */}
        <Selector uid={user?.id} onElegir={(emoji) => { setAbierto(false); onElegir(emoji); }} />
      </PopoverContent>
    </Popover>
  );
}

function Selector({ uid, onElegir }: { uid: string | undefined; onElegir: (emoji: string) => void }) {
  // Los usados hace poco son los MISMOS que los del Messenger: es la misma persona.
  const { frecuentes, anotar } = useReaccionesRecientes(uid);
  return (
    <SelectorDeEmojis
      className="flex-1"
      frecuentes={frecuentes}
      onElegir={(emoji) => { anotar(emoji); onElegir(emoji); }}
      // Con mouse, a escribir de una. En táctil abriría el teclado encima.
      enfocarBusqueda={typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches}
    />
  );
}

/** Los chips debajo del mensaje: «👍 2». Tocar uno ajeno reacciona igual (como
 *  Gmail); el propio queda marcado y no se puede deshacer (ya salió un correo). */
export function ChipsDeReacciones({ chips, puede, onSumar }: {
  chips: ChipDeReaccion[];
  puede: PuedeReaccionar;
  onSumar: (emoji: string) => void;
}) {
  const { t } = useLanguage();
  if (chips.length === 0) return null;
  return (
    <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={t("mail.react.lista")}>
      {chips.map((c) => {
        const nombres = c.quienes.map((q) => q ?? t("mail.react.tu")).join(", ");
        const titulo = c.mia ? t("mail.react.reaccionaste", { emoji: c.emoji, quienes: nombres }) : nombres;
        return (
          <li key={c.emoji}>
            <button
              type="button"
              title={titulo}
              disabled={c.mia || !puede.ok}
              onClick={() => onSumar(c.emoji)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-sm tabular-nums transition-colors",
                c.mia
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border bg-background hover:bg-muted",
                "disabled:cursor-default",
              )}
            >
              <span aria-hidden>{c.emoji}</span>
              <span className="text-xs text-muted-foreground">{c.quienes.length}</span>
              <span className="sr-only">{titulo}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
