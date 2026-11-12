import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ESTADOS, type Jornada } from "@/lib/argosJornada";
import { NOMBRE_ESTADO, RELLENO, textoMin, type Tr } from "./piezas";

// LA SEMANA DE LA PERSONA, DE LUNES A DOMINGO (Alvaro, 11/11/2026): por día,
// horas conectado, horas productivas, minutos sin cámara, sin pantalla, almuerzo
// y pausas, y fallas. Cada día con su barrita del turno; tocarlo abre ese día.
// En el teléfono cada día es un bloque con sus cifras en dos columnas.

function BarraMini({ j }: { j: Jornada }) {
  const total = Math.max(1, j.fin - j.inicio);
  if (j.tramos.length === 0) return <span className="block h-1.5 w-full bg-foreground/[0.05]" aria-hidden />;
  return (
    <span className="flex h-1.5 w-full overflow-hidden" aria-hidden>
      {j.tramos.map((tr) => <span key={tr.desde} className="h-full" style={{ width: `${((tr.hasta - tr.desde) * 100) / total}%`, ...RELLENO[tr.estado] }} />)}
    </span>
  );
}

const COLS = "md:grid-cols-[minmax(0,1.5fr)_repeat(6,minmax(0,1fr))_16px]";

export function SemanaDePersona({ dias, hoy, onAbrirDia, t, lang }: {
  dias: Jornada[];
  hoy: string;
  onAbrirDia: (fecha: string) => void;
  t: Tr;
  lang: string;
}) {
  const cabeza = [
    t("argos.semana.conectado"), t("argos.semana.productivas"), t("argos.cifra.sinCamara"),
    t("argos.cifra.sinPantalla"), t("argos.cifra.pausas"), t("argos.cifra.fallas"),
  ];
  const nombreDia = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString(lang === "es" ? "es-CO" : "en-US", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  const conDatos = dias.filter((d) => !d.sinSenal);
  const suma = (f: (d: Jornada) => number) => conDatos.reduce((a, d) => a + f(d), 0);

  const valores = (d: Jornada): string[] => [
    textoMin(d.conectadoSeg / 60, t),
    t("argos.cifra.deN", { a: d.horasProductivas, b: d.horasEvaluadas }),
    textoMin((d.seg.sin_camara + d.seg.fuera_de_camara) / 60, t),
    textoMin(d.seg.sin_pantalla / 60, t),
    textoMin((d.seg.pausa + d.seg.pausa_de_mas) / 60, t),
    String(d.fallas.length),
  ];
  const totales = [
    textoMin(suma((d) => d.conectadoSeg) / 60, t),
    t("argos.cifra.deN", { a: suma((d) => d.horasProductivas), b: suma((d) => d.horasEvaluadas) }),
    textoMin(suma((d) => d.seg.sin_camara + d.seg.fuera_de_camara) / 60, t),
    textoMin(suma((d) => d.seg.sin_pantalla) / 60, t),
    textoMin(suma((d) => d.seg.pausa + d.seg.pausa_de_mas) / 60, t),
    String(suma((d) => d.fallas.length)),
  ];

  return (
    <div className="flex flex-col">
      <div className={cn("hidden gap-4 border-b border-border/60 pb-2 text-xs text-muted-foreground md:grid", COLS)}>
        <span>{t("argos.semana.dia")}</span>
        {cabeza.map((c) => <span key={c} className="text-right">{c}</span>)}
        <span />
      </div>
      {dias.map((d) => {
        const futuro = d.fecha > hoy;
        const vacio = d.sinSenal;
        return (
          <button key={d.fecha} type="button" disabled={futuro} onClick={() => onAbrirDia(d.fecha)}
            className={cn("grid grid-cols-2 gap-x-4 gap-y-1.5 border-b border-border/40 py-3 text-left transition hover:bg-muted/30 disabled:opacity-40 disabled:hover:bg-transparent md:items-center", COLS)}>
            <span className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className={cn("truncate text-sm font-medium capitalize", d.fecha === hoy && "font-semibold")}>{nombreDia(d.fecha)}</span>
                <span className="text-xs tabular-nums text-muted-foreground md:hidden">
                  {futuro ? "" : vacio ? t("argos.semana.noEntro") : t("argos.semana.bienPct", { p: Math.round((d.pctBien ?? 0) * 100) })}
                </span>
              </span>
              {!futuro && <BarraMini j={d} />}
            </span>
            {futuro || vacio ? (
              <span className="col-span-2 text-xs text-muted-foreground md:col-span-6 md:text-right">{futuro ? t("argos.semana.aunNo") : d.conHorario ? t("argos.semana.noEntro") : t("argos.semana.sinTurno")}</span>
            ) : valores(d).map((v, i) => (
              <span key={cabeza[i]} className="flex flex-col md:items-end">
                <span className="text-[11px] text-muted-foreground md:hidden">{cabeza[i]}</span>
                <span className={cn("text-sm tabular-nums", i === 5 && d.fallas.length > 0 && "font-semibold text-destructive")}>{v}</span>
              </span>
            ))}
            <ChevronRight className="hidden h-4 w-4 text-muted-foreground md:block" />
          </button>
        );
      })}
      <div className={cn("grid grid-cols-2 gap-x-4 gap-y-1.5 pt-3 md:items-center", COLS)}>
        <span className="col-span-2 text-sm font-semibold md:col-span-1">{t("argos.semana.total", { n: conDatos.length })}</span>
        {totales.map((v, i) => (
          <span key={cabeza[i]} className="flex flex-col md:items-end">
            <span className="text-[11px] text-muted-foreground md:hidden">{cabeza[i]}</span>
            <span className={cn("font-display text-base font-semibold tabular-nums", i === 5 && v !== "0" && "text-destructive")}>{v}</span>
          </span>
        ))}
        <span />
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {ESTADOS.filter((e) => e !== "pendiente" && dias.some((d) => d.seg[e] > 0)).map((e) => (
          <li key={e} className="flex items-center gap-1.5"><span className="inline-block h-2 w-2" style={RELLENO[e]} />{t(NOMBRE_ESTADO[e])}</li>
        ))}
      </ul>
    </div>
  );
}
