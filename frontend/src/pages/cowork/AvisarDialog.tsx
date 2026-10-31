// El Avisar de una sala: el supervisor le manda una situación al chatter con la
// voz de Mario. Diseño aprobado por Álvaro (26/10): se abre desde el MEGÁFONO de
// la sala (no desde los tres puntitos), con las situaciones por CATEGORÍA (chips
// arriba) y cada una con dos botones DELICADOS — «Oír» (la escuchas tú para
// revisarla) y «Enviar» (le llega al chatter). Mismo diseño en teléfono y
// computadora para que haga match: en el cel sube como hoja desde abajo, en la
// compu sale como recuadro; el contenido es idéntico. Controlado desde afuera
// (open / onOpenChange): lo abre el megáfono de cada tarjeta.
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
import { anunciar } from "@/lib/anunciarVoz";
import SituacionesPorCategoria from "./SituacionesPorCategoria";
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

  const titulo = nombreChatter
    ? t("cowork.avisar.menuTitleName", { name: nombreChatter })
    : t("cowork.avisar.menuTitle");

  const cuerpo = (
    <SituacionesPorCategoria
      t={t}
      onEnviar={(slug, vozEs) => {
        // Que el supervisor OIGA lo mismo que le llega al chatter al enviar
        // (Álvaro, 21/10), y la hoja se cierra sola.
        void anunciar(vozEs);
        onAvisar(slug);
        onOpenChange(false);
      }}
    />
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
      <DialogContent className="max-w-xl gap-2 max-h-[85dvh] overflow-y-auto overflow-x-hidden">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display">{titulo}</DialogTitle>
          <DialogDescription>{t("cowork.avisar.dialogHint")}</DialogDescription>
        </DialogHeader>
        {cuerpo}
      </DialogContent>
    </Dialog>
  );
}
