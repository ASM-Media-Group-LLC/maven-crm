// El cartel que ve el CHATTER cuando su supervisor le manda un aviso desde el
// botón "Avisar". Aparece arriba, por encima de todo (incluso de la pantalla de
// pausa), con el nombre de quien avisó y la situación en palabras. La campana y
// la voz Mario las dispara el padre (CoworkParticipantView); esto es solo lo que
// se ve. Sin emojis ni íconos que confundan: el texto lo dice todo.
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import type { Traductor } from "./textosCowork";

export interface AvisoChatterProps {
  /** Nombre y apellido de quien avisó; si no se pudo resolver, va genérico. */
  nombreDe: string | null;
  etiqueta: TranslationKey;
  onCerrar: () => void;
  t: Traductor;
  className?: string;
}

export default function AvisoChatter({ nombreDe, etiqueta, onCerrar, t, className }: AvisoChatterProps) {
  return (
    <div
      role="alert"
      data-testid="aviso-chatter"
      className={cn(
        "absolute left-1/2 top-4 z-50 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2",
        "overflow-hidden rounded-2xl border border-amber-400/60 bg-slate-900/95 shadow-2xl ring-1 ring-amber-400/30 backdrop-blur",
        "motion-safe:animate-in motion-safe:slide-in-from-top-4 motion-safe:fade-in",
        className,
      )}
    >
      {/* Barra de acento: el color del aviso sin un ícono que pueda confundir. */}
      <div className="h-1 w-full bg-amber-400 motion-safe:animate-pulse" />
      <div className="flex flex-col gap-3 px-5 py-4 text-left text-white">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">
            {t("cowork.avisar.banner.title")}
          </span>
          <span className="text-xs text-white/60">
            {t("cowork.avisar.banner.from", { name: nombreDe ?? t("cowork.avisar.banner.coordinator") })}
          </span>
        </div>
        <p className="text-balance text-lg font-semibold leading-snug">{t(etiqueta)}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-full bg-white px-5 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-white/90 active:scale-[0.98]"
          >
            {t("cowork.avisar.banner.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
