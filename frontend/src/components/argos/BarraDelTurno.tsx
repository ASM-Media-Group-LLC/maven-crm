import { useMemo, useState } from "react";
import { Clock, ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ESTADOS, enRango, type Jornada, type Tramo } from "@/lib/argosJornada";
import type { Momento } from "@/lib/argosMomentos";
import { NOMBRE_ESTADO, Punto, RELLENO, hora, horaRedonda, textoMin, type Tr } from "./piezas";

// EL TURNO MINUTO A MINUTO (Alvaro, 11/11/2026: «desde el clock in contabilizamos
// cada minuto»). Una barra de la hora de ENTRADA de su horario a la de SALIDA,
// cada tramo con su estado; debajo, cada estado con sus minutos. Tocar un tramo
// dice qué fue, de qué hora a qué hora, y abre la captura de ese momento. Va en
// una tarjeta como las demás del expediente (misma paleta, mismo vidrio).

function porcentaje(j: Jornada, t: number): number {
  return ((t - j.inicio) / Math.max(1, j.fin - j.inicio)) * 100;
}

function marcas(j: Jornada): number[] {
  const out: number[] = [];
  for (let h = Math.ceil(j.inicio / 3_600_000) * 3_600_000; h <= j.fin; h += 3_600_000) out.push(h);
  return out;
}

export function BarraDelTurno({ jornada: j, cargando, error, onReintentar, momentos, onAbrirMomento, t, lang }: {
  jornada: Jornada | null;
  cargando: boolean;
  error: Error | null;
  onReintentar: () => void;
  momentos: Momento[];
  onAbrirMomento: (m: Momento) => void;
  t: Tr;
  lang: string;
}) {
  const [elegido, setElegido] = useState<Tramo | null>(null);
  const horas = useMemo(() => (j ? marcas(j) : []), [j]);
  const momentoElegido = elegido ? momentos.find((m) => enRango(m.at, elegido.desde, elegido.hasta)) ?? null : null;

  return (
    <section className="vidrio sube mt-4 p-4 lg:p-5">
      <div className="v-cont">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Clock className="h-3.5 w-3.5" />{t("argos.barra.titulo")}</p>
          {j && (
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {j.conHorario ? t("argos.barra.horario", { a: hora(j.inicio, lang), b: hora(j.fin, lang) }) : t("argos.barra.sinHorario")}
            </span>
          )}
        </div>

        {error ? (
          // Un fallo no es «no hizo nada»: se dice y se ofrece reintentar.
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-panel border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1">{t("argos.fallo")}</span>
            <button type="button" onClick={onReintentar} className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
              <RefreshCw className="h-3.5 w-3.5" />{t("argos.reintentar")}
            </button>
          </div>
        ) : cargando || !j ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="relative h-7 w-full overflow-hidden rounded-control bg-foreground/[0.05]" role="group" aria-label={t("argos.barra.aria")}>
              {j.tramos.map((tr) => {
                const izq = porcentaje(j, tr.desde);
                const ancho = porcentaje(j, tr.hasta) - izq;
                const sel = elegido?.desde === tr.desde;
                return (
                  <button key={tr.desde} type="button" onClick={() => setElegido(sel ? null : tr)} aria-pressed={sel}
                    aria-label={t("argos.barra.tramo", { a: hora(tr.desde, lang), b: hora(tr.hasta, lang), e: t(NOMBRE_ESTADO[tr.estado]), m: textoMin((tr.hasta - tr.desde) / 60_000, t) })}
                    className={cn("absolute inset-y-0 transition-opacity hover:opacity-80", sel && "z-10 ring-2 ring-inset ring-foreground/80")}
                    style={{ left: `${izq}%`, width: `max(1px, calc(${ancho}% - 1px))`, ...RELLENO[tr.estado] }} />
                );
              })}
            </div>
            <div className="relative mt-1 h-4 w-full text-[10px] tabular-nums text-muted-foreground">
              {horas.map((h, i) => {
                const izq = porcentaje(j, h);
                const borde = izq > 96 ? "-translate-x-full" : izq < 4 ? "" : "-translate-x-1/2";
                return (
                  <span key={h} className={cn("absolute top-0 whitespace-nowrap", borde, i % 2 === 1 && "hidden sm:inline")} style={{ left: `${izq}%` }}>
                    {horaRedonda(h, lang)}
                  </span>
                );
              })}
            </div>

            {elegido && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-panel border border-border/50 bg-card/40 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 font-medium"><Punto estado={elegido.estado} />{t(NOMBRE_ESTADO[elegido.estado])}</span>
                <span className="tabular-nums text-muted-foreground">{hora(elegido.desde, lang)} – {hora(elegido.hasta, lang)}</span>
                <span className="font-semibold tabular-nums">{textoMin((elegido.hasta - elegido.desde) / 60_000, t)}</span>
                {momentoElegido ? (
                  <button type="button" onClick={() => onAbrirMomento(momentoElegido)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-control border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <ImageIcon className="h-3.5 w-3.5" />{t("argos.barra.verCaptura")}
                  </button>
                ) : (
                  <span className="ml-auto text-xs text-muted-foreground">{t("argos.barra.sinCaptura")}</span>
                )}
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {ESTADOS.filter((e) => e === "bien" || j.seg[e] > 0).map((e) => (
                <div key={e} className="flex items-baseline gap-2 text-[12px]">
                  <Punto estado={e} className="self-center" />
                  <span className="min-w-0 flex-1 truncate text-foreground/80">{t(NOMBRE_ESTADO[e])}</span>
                  <span className="font-semibold tabular-nums">{textoMin(j.seg[e] / 60, t)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
