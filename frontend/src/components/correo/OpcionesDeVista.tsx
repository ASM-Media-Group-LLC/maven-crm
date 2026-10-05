import { Columns2, ListFilter, Square } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import type { PrefsCorreo } from "@/hooks/usePreferenciasCorreo";

// Las dos elecciones de cómo se ve el correo (Keila, 02/10), como en Gmail. Se
// guardan por persona (ver hooks/usePreferenciasCorreo).

const BOTON =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/** «Panel de lectura»: Dividir (la lista al lado del correo abierto) o Sin
 *  división (el correo abierto ocupa todo y se vuelve con la flecha, «u» o
 *  Escape). Solo existe donde hay lugar para dividir: en el teléfono siempre
 *  se ve una cosa por vez. */
export function BotonPanelDeLectura({
  lectura, onCambiar, className,
}: {
  lectura: PrefsCorreo["lectura"];
  onCambiar: (l: PrefsCorreo["lectura"]) => void;
  className?: string;
}) {
  const { t } = useLanguage();
  const Icono = lectura === "completa" ? Square : Columns2;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t("mail.view.readingPane")} title={t("mail.view.readingPane")} className={cn(BOTON, className)}>
          <Icono className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t("mail.view.readingPane")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={lectura}
          onValueChange={(v) => onCambiar(v === "completa" ? "completa" : "dividir")}
        >
          <DropdownMenuRadioItem value="dividir" className="flex-col items-start">
            <span>{t("mail.view.split")}</span>
            <span className="text-xs text-muted-foreground">{t("mail.view.splitDesc")}</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="completa" className="flex-col items-start">
            <span>{t("mail.view.full")}</span>
            <span className="text-xs text-muted-foreground">{t("mail.view.fullDesc")}</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** «No leídos primero»: un interruptor en la barra de la lista de Recibidos. */
export function BotonNoLeidosPrimero({ activo, onCambiar }: { activo: boolean; onCambiar: (v: boolean) => void }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      aria-pressed={activo}
      aria-label={t("mail.unreadFirst")}
      title={t("mail.unreadFirst")}
      onClick={() => onCambiar(!activo)}
      className={cn(BOTON, "ml-1", activo && "bg-primary/12 text-primary hover:bg-primary/15 hover:text-primary")}
    >
      <ListFilter className="h-4 w-4" />
    </button>
  );
}

/** El rótulo de una sección de la lista («No leídos», «Todo lo demás»). */
export function RotuloDeSeccion({ texto, cantidad }: { texto: string; cantidad?: number }) {
  return (
    <div data-rotulo={texto} className="flex items-center gap-2 px-2.5 pb-1 pt-3 text-xs font-semibold text-muted-foreground">
      <span>{texto}</span>
      {cantidad != null && cantidad > 0 && (
        <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{cantidad}</span>
      )}
      <span className="h-px flex-1 bg-border/60" aria-hidden />
    </div>
  );
}
