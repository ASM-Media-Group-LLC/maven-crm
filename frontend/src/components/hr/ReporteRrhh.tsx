import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import { useFotosCaso, useReporteRrhh } from "@/hooks/useCasosArgos";
import { type FilaReporte, type Veredicto, ETIQUETA_VEREDICTO, fechaDeDia, tonoVeredicto } from "@/lib/casosArgos";
import type { TranslationKey } from "@/lib/i18n";

// El reporte limpio de RR. HH. (19/11/2026): lo que el dueño recibe a las 9 am.
// Cuatro números arriba (como tiles, no anillos) y la lista por veredicto, con
// lo que pasó, la frase de RR. HH. y quién lo decidió.

const GRUPOS: Array<{ v: Veredicto | null; titulo: TranslationKey }> = [
  { v: "cometio", titulo: "hr.casos.rep.cometieron" },
  { v: null, titulo: "hr.casos.rep.sinRevisar" },
  { v: "justificado", titulo: "hr.casos.rep.justificados" },
  { v: "no_cometio", titulo: "hr.casos.rep.sinFalta" },
];

function Tile({ n, etiqueta, v }: { n: number; etiqueta: string; v: Veredicto | null }) {
  const tono = tonoVeredicto(v);
  return (
    <div className={`flex flex-col gap-0.5 rounded-panel border p-3 ${tono.caja}`}>
      <span className={`font-display text-2xl font-bold tabular-nums ${n > 0 ? tono.texto : "text-muted-foreground"}`}>{n}</span>
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
    </div>
  );
}

function Fila({ r }: { r: FilaReporte }) {
  const { t } = useLanguage();
  const fotos = useFotosCaso(r.veredicto === "cometio" && r.foto_path ? [r.foto_path] : []);
  const url = r.foto_path ? fotos.data?.[r.foto_path] : undefined;
  return (
    <li className="flex items-start gap-3 py-3">
      <UserAvatar name={r.nombre ?? "?"} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link to={`/argos/caso/${r.id}`} className="truncate text-sm font-semibold text-foreground hover:underline">{r.nombre}</Link>
          {r.puesto && <span className="truncate text-xs text-muted-foreground">{r.puesto}</span>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{r.que}</p>
        {r.frase && (
          <p className="mt-1 text-sm text-foreground">
            «{r.frase}» <span className="text-xs text-muted-foreground">— {r.juez ?? "RR. HH."}{r.corregido ? ` · ${t("hr.casos.corregido")}` : ""}</span>
          </p>
        )}
      </div>
      {url && <img src={url} alt="" loading="lazy" className="hidden h-12 w-20 shrink-0 rounded-control border border-border/50 object-cover sm:block" />}
    </li>
  );
}

export function ReporteRrhhVista({ dia }: { dia: string }) {
  const { t } = useLanguage();
  const f = useFormato();
  const q = useReporteRrhh(dia);

  if (q.isLoading) return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (q.isError || !q.data) {
    return (
      <div className="vidrio flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">{t("hr.casos.errorCargar")}</p>
        <Button variant="outline" size="sm" className="rounded-control" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.casos.reintentar")}</Button>
      </div>
    );
  }
  const r = q.data;
  return (
    <section className="vidrio flex flex-col gap-4 p-4 sm:p-5">
      <header>
        <h3 className="font-display text-base font-bold text-foreground">{t("hr.casos.rep.titulo")}</h3>
        <p className="text-xs text-muted-foreground"><span className="capitalize">{format(fechaDeDia(dia), "EEEE d MMMM yyyy", { locale: f.fechas })}</span> · {t("hr.casos.rep.nCasos", { n: r.total })}</p>
      </header>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile n={r.cometio} etiqueta={t("hr.casos.rep.cometieron")} v="cometio" />
        <Tile n={r.sin_revisar} etiqueta={t("hr.casos.rep.sinRevisar")} v={null} />
        <Tile n={r.justificado} etiqueta={t("hr.casos.rep.justificados")} v="justificado" />
        <Tile n={r.no_cometio} etiqueta={t("hr.casos.rep.sinFalta")} v="no_cometio" />
      </div>
      {r.total === 0 ? (
        <p className="text-sm text-muted-foreground">{t("hr.casos.rep.vacio")}</p>
      ) : GRUPOS.map((g) => {
        const filas = r.casos.filter((c) => (c.veredicto ?? null) === g.v);
        if (filas.length === 0) return null;
        const tono = tonoVeredicto(g.v);
        return (
          <div key={g.v ?? "sin"} className="flex flex-col">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${tono.punto}`} />{t(g.titulo)} · {filas.length}
            </h4>
            <ul className="divide-y divide-border/40">
              {filas.map((x) => <Fila key={x.id} r={x} />)}
            </ul>
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">{t("hr.casos.rep.nota", { v: t(ETIQUETA_VEREDICTO.cometio) })}</p>
    </section>
  );
}
