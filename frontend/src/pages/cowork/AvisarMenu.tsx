// El botón "Avisar" que sale al lado de "Entrar" en la tarjeta de cada sala del
// tablero. Solo lo ven los supervisores designados (ver AVISADORES en
// lib/coworkAvisos y la policy de cowork_avisos). Despliega las situaciones
// agrupadas; al elegir una, el padre inserta el aviso y al chatter le llega en
// su pantalla (cartel + campana + voz Mario).
//
// Sin íconos de situación (Álvaro no los quiere): cada opción es la frase en
// palabras. El único adorno es la flechita del desplegable.
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { GRUPOS_AVISO, situacionesDe } from "@/lib/coworkAvisos";
import type { Traductor } from "./textosCowork";

interface AvisarMenuProps {
  /** Nombre del chatter al que se le avisaría (para el encabezado del menú). */
  nombreChatter: string | null;
  /** Sin nadie en la sala no hay a quién avisar: el botón queda apagado. */
  disabled: boolean;
  onAvisar: (slug: string) => void;
  t: Traductor;
}

export default function AvisarMenu({ nombreChatter, disabled, onAvisar, t }: AvisarMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-8 rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-400/20 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200"
        >
          {t("cowork.avisar.trigger")}
          <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {nombreChatter
            ? t("cowork.avisar.menuTitleName", { name: nombreChatter })
            : t("cowork.avisar.menuTitle")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {GRUPOS_AVISO.map(({ grupo, titulo }) => {
          const items = situacionesDe(grupo);
          if (!items.length) return null;
          return (
            <DropdownMenuSub key={grupo}>
              <DropdownMenuSubTrigger className="text-sm">{t(titulo)}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-w-[16rem]">
                {items.map((s) => (
                  <DropdownMenuItem key={s.slug} className="text-sm" onSelect={() => onAvisar(s.slug)}>
                    {t(s.etiqueta)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
