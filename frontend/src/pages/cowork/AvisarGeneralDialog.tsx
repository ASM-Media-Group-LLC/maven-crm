// El botón "Avisar" GENERAL del Supervisor Hub: a diferencia del de cada sala
// (que apunta al chatter de ESA sala), aquí primero eliges A QUIÉN —una persona
// de la sesión, o "A todos"— y luego la situación. Útil para avisarle a un
// supervisor (solo el dueño) o mandar un aviso a toda la sesión de golpe.
//
// Los objetivos ya vienen filtrados por lo que ESTE usuario puede avisar (los 4
// designados → chatters; el dueño → supervisores). La RLS de cowork_avisos
// vuelve a validar cada fila, así que esto es solo para no ofrecer lo que la
// base rechazaría.
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
import { Megaphone, Users } from "lucide-react";
import { GRUPOS_AVISO, situacionesDe } from "@/lib/coworkAvisos";
import { anunciar } from "@/lib/anunciarVoz";
import { cn } from "@/lib/utils";
import type { Traductor } from "./textosCowork";

export interface ObjetivoAviso {
  uid: string;
  nombre: string;
  esSupervisor: boolean;
}

interface AvisarGeneralDialogProps {
  /** Personas a las que ESTE usuario puede avisar (ya filtradas por permiso). */
  objetivos: ObjetivoAviso[];
  /** Manda la situación a los user_id elegidos (uno, o todos). */
  onAvisar: (targetIds: string[], slug: string) => void;
  t: Traductor;
}

const TODOS = "__todos__";

export default function AvisarGeneralDialog({ objetivos, onAvisar, t }: AvisarGeneralDialogProps) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null); // uid de la persona, TODOS, o nada

  const idsElegidos = (): string[] => {
    if (sel === TODOS) return objetivos.map((o) => o.uid);
    if (sel) return [sel];
    return [];
  };

  const enviar = (slug: string, vozEs: string) => {
    const ids = idsElegidos();
    if (!ids.length) return;
    // El que envía también lo oye, como el botón por sala (así sabe qué le llegó
    // a la otra persona).
    void anunciar(vozEs);
    onAvisar(ids, slug);
    setOpen(false);
    setSel(null);
  };

  const chip = (activo: boolean) =>
    cn(
      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
      activo
        ? "border-amber-400 bg-amber-400/20 text-amber-700 dark:text-amber-200"
        : "border-border bg-muted/30 text-foreground hover:bg-muted/60",
    );

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSel(null); }}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={objetivos.length === 0}
          className="h-7 w-full rounded-full border border-border bg-muted/40 px-2.5 text-[11px] font-semibold text-foreground hover:bg-muted/70 hover:text-foreground"
        >
          <Megaphone className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {t("cowork.avisar.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md gap-3 max-h-[85dvh] overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>{t("cowork.avisar.generalTitle")}</DialogTitle>
          <DialogDescription>{t("cowork.avisar.generalHint")}</DialogDescription>
        </DialogHeader>

        {/* Paso 1: a quién */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("cowork.avisar.pickTarget")}</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setSel(TODOS)} className={chip(sel === TODOS)}>
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {t("cowork.avisar.everyone", { count: objetivos.length })}
            </button>
            {objetivos.map((o) => (
              <button key={o.uid} type="button" onClick={() => setSel(o.uid)} className={chip(sel === o.uid)}>
                {o.nombre}
                {o.esSupervisor && (
                  <span className="text-[10px] uppercase text-amber-600 dark:text-amber-400">
                    {t("cowork.avisar.supervisorTag")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Paso 2: la situación (apagada hasta elegir a quién) */}
        <div className={cn("flex flex-col gap-4", !sel && "pointer-events-none opacity-40")}>
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
                      disabled={!sel}
                      className="h-7 shrink-0 bg-amber-500 px-3 text-xs font-semibold text-white hover:bg-amber-500/90"
                      onClick={() => enviar(s.slug, s.vozEs)}
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
