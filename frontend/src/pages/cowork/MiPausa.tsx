// La pantalla que ve la PERSONA en su propia pausa (baño / break / almuerzo).
//
// Antes, quien marcaba pausa solo veía una pastilla chica con un contador en la
// barra de arriba: nada que lo empujara a volver. Álvaro pidió un "mini
// dashboard" que ocupe la pantalla mientras está en pausa, con su avatar en un
// anillo que se llena, el tiempo grande de ESTA pausa y, debajo, cuánto lleva
// HOY de cada pausa. La idea es que al mirar la pantalla se vea de un golpe que
// el tiempo corre y que todo queda registrado.
//
// Fondo: el mismo paisaje nocturno de la miniatura del coordinador
// (PaisajeDePausa), para que las dos vistas de pausa sean la misma familia y el
// ámbar/rojo del tiempo se lea igual en los dos temas.
import { Droplet, Coffee, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";
import { cuentaPausa, type EstadoPausa } from "@/lib/pausaCowork";
import { PaisajeDePausa } from "./SalaEnPausa";
import { NOMBRE_PAUSA, type Traductor } from "./textosCowork";
import type { TranslationKey } from "@/lib/i18n";

export type TipoPausa = "bano" | "break" | "almuerzo";

const ICONO: Record<TipoPausa, typeof Droplet> = {
  bano: Droplet,
  break: Coffee,
  almuerzo: Utensils,
};

// El título de la pausa en curso ("En el baño" / "En break" / "En almuerzo").
const TITULO_ACTIVA: Record<TipoPausa, TranslationKey> = {
  bano: "cowork.pauseTile.inBathroom",
  break: "cowork.pauseTile.onBreak",
  almuerzo: "cowork.pauseTile.inLunch",
};

function mmss(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  const m = Math.floor(s / 60);
  return `${m} min`;
}

/** Iniciales para el avatar: primera y última palabra del nombre. */
export function inicialesDe(nombre: string | null | undefined): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "·";
  if (partes.length === 1) return partes[0]!.charAt(0).toUpperCase();
  return (partes[0]!.charAt(0) + partes[partes.length - 1]!.charAt(0)).toUpperCase();
}

export interface TileResumen {
  kind: TipoPausa;
  usadoSeg: number;
  limiteMin: number | null;
  estado: EstadoPausa;
}

/** Los recuadros de "Hoy en pausas": cuánto lleva hoy de cada tipo y su tope.
 *  Al tipo que está en curso se le suma el tiempo que corre en vivo, para que
 *  el recuadro cuadre con el reloj grande. Puro, para probarlo. */
export function resumenMiPausa(
  consumoHoy: Record<string, number>,
  limites: Record<string, number>,
  activo: { kind: string; elapsed: number } | null,
  kinds: readonly TipoPausa[],
): TileResumen[] {
  return kinds.map((kind) => {
    const vivo = activo && activo.kind === kind ? activo.elapsed : 0;
    const usadoSeg = (consumoHoy[kind] ?? 0) + vivo;
    const limiteMin = limites[kind] ?? null;
    let estado: EstadoPausa = "ok";
    if (limiteMin != null) {
      const topeSeg = limiteMin * 60;
      estado = usadoSeg >= topeSeg ? "excedida" : usadoSeg >= topeSeg * 0.75 ? "poco" : "ok";
    }
    return { kind, usadoSeg, limiteMin, estado };
  });
}

const COLOR_ANILLO: Record<EstadoPausa, string> = {
  ok: "#34d399", // emerald-400
  poco: "#fbbf24", // amber-400
  excedida: "#f87171", // red-400
};
const COLOR_TEXTO: Record<EstadoPausa, string> = {
  ok: "text-emerald-300",
  poco: "text-amber-300",
  excedida: "text-red-300",
};

export interface MiPausaProps {
  nombre: string;
  kind: TipoPausa | null;
  /** Segundos de ESTA pausa. */
  segundos: number;
  /** Epoch ms de cuándo arrancó. */
  desde: number | null;
  /** Tope en minutos de la pausa en curso. */
  limiteMin: number | null;
  /** Segundos ya gastados hoy del tipo en curso (para el anillo; baño es diario). */
  consumidoPrevio: number;
  /** Segundos consumidos hoy por tipo (pausas ya cerradas), para los recuadros. */
  consumoHoy: Record<string, number>;
  /** Topes en minutos por tipo. */
  limites: Record<string, number>;
  /** Qué recuadros mostrar en "Hoy en pausas". */
  kindsResumen: readonly TipoPausa[];
  onVolver: () => void;
  t: Traductor;
  /** Hora corta "1:51 p. m." ya formateada por el padre (usa su locale). */
  horaDesde: string | null;
  className?: string;
}

export default function MiPausa({
  nombre, kind, segundos, desde: _desde, limiteMin, consumidoPrevio,
  consumoHoy, limites, kindsResumen, onVolver, t, horaDesde, className,
}: MiPausaProps) {
  const activa: TipoPausa = kind ?? "bano";
  const Icono = ICONO[activa];
  const c = cuentaPausa(segundos, limiteMin, consumidoPrevio);
  const estado = c.estado;
  const colorAnillo = COLOR_ANILLO[estado];

  // Anillo: porción del tope ya usada (lo acumulado hoy del tipo + lo de ahora).
  const usadoSeg = consumidoPrevio + segundos;
  const pct = limiteMin != null ? Math.min(100, (usadoSeg / (limiteMin * 60)) * 100) : 0;
  const R = 52, C = 2 * Math.PI * R;
  const dash = limiteMin != null ? (pct / 100) * C : C; // sin tope: anillo lleno y tenue

  const tiles = resumenMiPausa(consumoHoy, limites, kind ? { kind: activa, elapsed: segundos } : null, kindsResumen);

  return (
    <div
      data-testid="mi-pausa"
      data-estado={estado}
      className={cn(
        "absolute inset-0 overflow-auto flex flex-col items-center justify-center gap-5 px-5 py-6 text-center text-white md:gap-6",
        className,
      )}
    >
      <PaisajeDePausa excedida={estado === "excedida"} />

      {/* Chapa del estado: "En el baño" / "En break". */}
      <div className={cn(
        "relative inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold",
        estado === "excedida" ? "border-red-400/40 bg-red-500/15 text-red-200" : "border-white/20 bg-white/10 text-white/90",
      )}>
        <Icono className="h-4 w-4" />
        {t(TITULO_ACTIVA[activa])}
      </div>

      {/* Avatar en el anillo + tiempo grande de ESTA pausa. */}
      <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:gap-7">
        <div className="relative h-[128px] w-[128px] shrink-0">
          <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
            <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="9" />
            <circle
              cx="64" cy="64" r={R} fill="none"
              stroke={colorAnillo} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`}
              className={cn("transition-[stroke-dasharray] duration-700", estado === "excedida" && "animate-pulse motion-reduce:animate-none")}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-display text-2xl font-bold tracking-wide text-white md:text-3xl">{inicialesDe(nombre)}</span>
          </div>
        </div>
        <div className="flex flex-col items-center sm:items-start">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">{t("cowork.miPausa.thisPause")}</span>
          <span className={cn("font-display text-5xl font-bold tabular-nums leading-none md:text-6xl", COLOR_TEXTO[estado], estado === "excedida" && "animate-pulse motion-reduce:animate-none")}>
            {c.texto}
          </span>
          <span className="mt-2 min-h-[1.25rem] text-xs text-white/70">
            {c.excedida
              ? t("cowork.miPausa.over")
              : horaDesde
                ? t("cowork.pauseTile.since", { time: horaDesde })
                : null}
          </span>
        </div>
      </div>

      {/* Hoy en pausas: un recuadro por tipo con lo usado y su tope. */}
      <div className="relative w-full max-w-md">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">{t("cowork.miPausa.today")}</div>
        <div className={cn("grid gap-2", tiles.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
          {tiles.map((tile) => {
            const IconoTile = ICONO[tile.kind];
            const activoTile = kind != null && tile.kind === activa;
            return (
              <div
                key={tile.kind}
                className={cn(
                  "rounded-xl border px-2.5 py-3",
                  tile.estado === "excedida"
                    ? "border-red-400/40 bg-red-500/15"
                    : tile.estado === "poco"
                      ? "border-amber-400/30 bg-amber-500/10"
                      : "border-white/15 bg-white/[0.06]",
                  activoTile && "ring-1 ring-white/50",
                )}
              >
                <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-white/70">
                  <IconoTile className="h-3.5 w-3.5" />
                  {t(NOMBRE_PAUSA[tile.kind])}
                </div>
                <div className={cn("mt-1 font-display text-lg font-bold tabular-nums", COLOR_TEXTO[tile.estado])}>
                  {mmss(tile.usadoSeg)}
                </div>
                <div className="text-[10px] text-white/50">
                  {tile.limiteMin != null ? t("cowork.miPausa.ofLimit", { limit: tile.limiteMin }) : t("cowork.pauseTile.noLimit")}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onVolver}
        className="relative inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-white/90 active:scale-[0.98]"
      >
        {t("cowork.miPausa.imBack")}
      </button>
    </div>
  );
}
