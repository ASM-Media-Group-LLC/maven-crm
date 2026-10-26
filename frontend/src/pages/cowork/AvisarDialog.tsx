// El Avisar de una sala: el supervisor le manda una situación al chatter con la
// voz de Mario. Diseño aprobado por Álvaro (26/10): se abre desde el MEGÁFONO de
// la sala (no desde los tres puntitos), con las situaciones por CATEGORÍA (chips
// arriba) y cada una con dos botones DELICADOS — «Oír» (la escuchas tú para
// revisarla) y «Enviar» (le llega al chatter). Mismo diseño en teléfono y
// computadora para que haga match: en el cel sube como hoja desde abajo, en la
// compu sale como recuadro; el contenido es idéntico. Controlado desde afuera
// (open / onOpenChange): lo abre el megáfono de cada tarjeta.
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Volume2, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { GRUPOS_AVISO, situacionesDe, type GrupoAviso } from "@/lib/coworkAvisos";
import { anunciar } from "@/lib/anunciarVoz";
import type { Traductor } from "./textosCowork";

interface AvisarDialogProps {
  /** Nombre del chatter al que se le avisaría (encabezado). */
  nombreChatter: string | null;
  onAvisar: (slug: string) => void;
  t: Traductor;
  /** Controlado desde el megáfono de la sala. */
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
}

export default function AvisarDialog({ nombreChatter, onAvisar, t, open, onOpenChange }: AvisarDialogProps) {
  const isMobile = useIsMobile();
  // La categoría se reinicia en Foco cada vez que se abre: lo más usado primero.
  const [grupo, setGrupo] = useState<GrupoAviso>("foco");

  const titulo = nombreChatter
    ? t("cowork.avisar.menuTitleName", { name: nombreChatter })
    : t("cowork.avisar.menuTitle");

  const cuerpo = (
    <div className="mt-2 min-w-0">
      {/* Categorías: tocas una y ves sus situaciones. Nada que bajar. */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {GRUPOS_AVISO.map(({ grupo: g, titulo: tl }) => (
          <button
            key={g}
            type="button"
            onClick={() => setGrupo(g)}
            aria-pressed={grupo === g}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              grupo === g
                ? "border-violet-400/50 bg-violet-500/15 text-violet-200 [box-shadow:0_0_18px_-9px_hsl(263_80%_64%)]"
                : "border-border bg-muted/30 text-muted-foreground hover:text-foreground",
            )}
          >
            {t(tl)}
          </button>
        ))}
      </div>

      {/* Situaciones de la categoría: cada una con Oír (fantasma) y Enviar
          (tinte violeta suave). Delicados — nada prendido. */}
      <div className="mt-3 grid min-w-0 grid-cols-2 gap-2.5">
        {situacionesDe(grupo).map((s) => (
          <div
            key={s.slug}
            className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border/70 bg-gradient-to-b from-card/80 to-card/40 p-3 [box-shadow:inset_0_1px_0_hsl(0_0%_100%/.05)]"
          >
            <span className="text-sm font-semibold leading-snug">{t(s.etiqueta)}</span>
            <div className="mt-auto flex gap-2">
              <button
                type="button"
                onClick={() => { void anunciar(s.vozEs); }}
                className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <Volume2 className="h-3.5 w-3.5 shrink-0" /> {t("cowork.avisar.listen")}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Que el supervisor OIGA lo mismo que le llega al chatter al
                  // enviar (Álvaro, 21/10), y la hoja se cierra sola.
                  void anunciar(s.vozEs);
                  onAvisar(s.slug);
                  onOpenChange(false);
                }}
                className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-violet-400/40 bg-violet-500/10 px-2 py-2 text-xs font-semibold text-violet-200 transition-colors hover:bg-violet-500/20"
              >
                <Megaphone className="h-3.5 w-3.5 shrink-0" /> {t("cowork.avisar.send")}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Leyenda: Oír ≠ Enviar, sin confusión. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border bg-muted/40" />
          <b className="font-semibold text-foreground">{t("cowork.avisar.listen")}</b> — {t("cowork.avisar.oirQue")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-violet-400/50 bg-violet-500/20" />
          <b className="font-semibold text-foreground">{t("cowork.avisar.send")}</b> — {t("cowork.avisar.enviarQue")}
        </span>
      </div>
    </div>
  );

  // Teléfono: hoja que sube desde abajo. Computadora: recuadro centrado. Mismo
  // contenido en los dos.
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto overflow-x-hidden rounded-t-2xl px-4 pb-6 pt-4">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display">{titulo}</SheetTitle>
            <SheetDescription>{t("cowork.avisar.dialogHint")}</SheetDescription>
          </SheetHeader>
          {cuerpo}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-2 max-h-[85dvh] overflow-y-auto overflow-x-hidden bg-none">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display">{titulo}</DialogTitle>
          <DialogDescription>{t("cowork.avisar.dialogHint")}</DialogDescription>
        </DialogHeader>
        {cuerpo}
      </DialogContent>
    </Dialog>
  );
}
