// El cuerpo del "Avisar" aprobado por Álvaro (26/10): chips por CATEGORÍA arriba
// (tocas una y ves sus situaciones, nada que bajar) y cada situación en una
// tarjeta con dos botones delicados — «Oír» (la escuchas tú) y «Enviar» (le
// llega al chatter con la voz Mario). Violeta, nada prendido. El min-w-0 en el
// cuerpo, la cuadrícula, las tarjetas y los botones es lo que hace que las dos
// columnas encajen sin cortarse en la computadora.
//
// Lo comparten las dos ventanas de Avisar —la de cada sala (AvisarDialog) y la
// general del Supervisor Hub (AvisarGeneralDialog)— para que se vean y se porten
// igual, y para que un arreglo en una valga para las dos. La general lo apaga
// (`disabled`) hasta que se elija a quién avisar.
import { useState } from "react";
import { Volume2, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { GRUPOS_AVISO, situacionesDe, type GrupoAviso } from "@/lib/coworkAvisos";
import { anunciar } from "@/lib/anunciarVoz";
import type { Traductor } from "./textosCowork";

interface SituacionesPorCategoriaProps {
  /** Manda la situación. El padre decide a quién y cierra la ventana. */
  onEnviar: (slug: string, vozEs: string) => void;
  /** Apaga la lista hasta que falte un paso previo (elegir a quién). */
  disabled?: boolean;
  t: Traductor;
}

export default function SituacionesPorCategoria({ onEnviar, disabled = false, t }: SituacionesPorCategoriaProps) {
  // La categoría se reinicia en Foco cada vez que se abre: lo más usado primero.
  const [grupo, setGrupo] = useState<GrupoAviso>("foco");

  return (
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
      <div className={cn("mt-3 grid min-w-0 grid-cols-2 gap-2.5", disabled && "pointer-events-none opacity-40")}>
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
                onClick={() => onEnviar(s.slug, s.vozEs)}
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
}
