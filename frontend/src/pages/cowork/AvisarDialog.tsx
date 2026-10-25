// La ventana (pop-up) del botón "Avisar": se abre en el centro de la pantalla,
// muestra las situaciones ordenadas por grupo, y cada una trae DOS acciones
// claras — "Oír" (reproduce la voz Mario, para probar cómo le va a sonar al
// chatter) y "Enviar" (le manda el aviso). Reemplaza al menú desplegable, que
// quedaba apretado y no dejaba escuchar (Álvaro, 21/10).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ChevronDown } from "lucide-react";
import { GRUPOS_AVISO, situacionesDe } from "@/lib/coworkAvisos";
import { anunciar } from "@/lib/anunciarVoz";
import type { Traductor } from "./textosCowork";

interface AvisarDialogProps {
  /** Nombre del chatter al que se le avisaría (encabezado de la ventana). */
  nombreChatter: string | null;
  /** Sin nadie en la sala no hay a quién avisar: el botón queda apagado. */
  disabled: boolean;
  onAvisar: (slug: string) => void;
  t: Traductor;
}

export default function AvisarDialog({ nombreChatter, disabled, onAvisar, t }: AvisarDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-8 rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-400/20 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200"
        >
          {t("cowork.avisar.trigger")}
          <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md gap-3 max-h-[85dvh] overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>
            {nombreChatter
              ? t("cowork.avisar.menuTitleName", { name: nombreChatter })
              : t("cowork.avisar.menuTitle")}
          </DialogTitle>
          <DialogDescription>{t("cowork.avisar.dialogHint")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {GRUPOS_AVISO.map(({ grupo, titulo }) => {
            const items = situacionesDe(grupo);
            if (!items.length) return null;
            return (
              <section key={grupo} className="flex flex-col gap-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  {t(titulo)}
                </h3>
                {items.map((s) => (
                  <div
                    key={s.slug}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 text-sm leading-snug">{t(s.etiqueta)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => { void anunciar(s.vozEs); }}
                    >
                      {t("cowork.avisar.listen")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 shrink-0 bg-amber-500 px-3 text-xs font-semibold text-white hover:bg-amber-500/90"
                      onClick={() => {
                        // Que el supervisor OIGA lo mismo que le llega al chatter al
                        // enviar, no solo un "Enviado" escrito (Álvaro, 21/10).
                        void anunciar(s.vozEs);
                        onAvisar(s.slug);
                        setOpen(false);
                      }}
                    >
                      {t("cowork.avisar.send")}
                    </Button>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
