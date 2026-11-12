import { Users } from "lucide-react";
import { promedioDelEquipo, type Jornada } from "@/lib/argosJornada";
import { Cuadrito, pct, textoMin, type Tr } from "./piezas";

// SU DÍA CONTRA EL DE SU EQUIPO (Alvaro, 11/11/2026), con los mismos cuadritos
// del expediente: el número grande es el suyo y debajo el promedio de su equipo
// (los compañeros del mismo equipo y nivel que SÍ entraron ese día; no se
// promedia a quien no vino). Si no hay con quién comparar, se dice.

export function ContraSuEquipo({ jornada: j, equipo, nombreEquipo, t }: {
  jornada: Jornada;
  equipo: Jornada[];
  nombreEquipo: string | null;
  t: Tr;
}) {
  const prom = promedioDelEquipo(equipo);
  const min = (s: number) => textoMin(s / 60, t);
  return (
    <section className="mt-5 p-5 sm:p-6 rounded-control border border-border bg-card">
      <div>
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground/90">
          <Users className="h-4 w-4 text-muted-foreground" />{t("argos.equipo.titulo")}
          {prom && <span className="font-normal">· {t("argos.equipo.sub", { e: nombreEquipo ?? "—", n: prom.personas })}</span>}
        </p>
        {!prom ? (
          <p className="text-sm text-muted-foreground">{t("argos.equipo.solo", { e: nombreEquipo ?? "—" })}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Cuadrito valor={pct(j.pctBien)} etiqueta={t("argos.equipo.trabajoBien")} detalle={t("argos.equipo.suEquipo", { v: pct(prom.pctBien) })} />
            <Cuadrito valor={min(j.conectadoSeg)} etiqueta={t("argos.cifra.conectado")} detalle={t("argos.equipo.suEquipo", { v: min(prom.conectadoSeg) })} />
            <Cuadrito valor={min(j.seg.sin_pantalla)} etiqueta={t("argos.cifra.sinPantalla")} detalle={t("argos.equipo.suEquipo", { v: min(prom.seg.sin_pantalla) })} />
            <Cuadrito valor={min(j.seg.sin_camara + j.seg.fuera_de_camara)} etiqueta={t("argos.cifra.sinCamara")} detalle={t("argos.equipo.suEquipo", { v: min(prom.seg.sin_camara + prom.seg.fuera_de_camara) })} />
            <Cuadrito valor={min(j.seg.fuera_cowork + j.seg.se_fue)} etiqueta={t("argos.estado.fuera_cowork")} detalle={t("argos.equipo.suEquipo", { v: min(prom.seg.fuera_cowork + prom.seg.se_fue) })} />
            <Cuadrito valor={String(j.fallas.length)} etiqueta={t("argos.cifra.fallas")} detalle={t("argos.equipo.suEquipo", { v: (Math.round(prom.fallas * 10) / 10).toLocaleString() })} />
          </div>
        )}
      </div>
    </section>
  );
}
