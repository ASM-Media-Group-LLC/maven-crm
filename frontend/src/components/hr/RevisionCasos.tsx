import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import { useCasosDelDia, useDiasConCasos, useFuncionesCasos } from "@/hooks/useCasosArgos";
import { CasoTarjeta } from "@/components/hr/CasoTarjeta";
import { ReporteRrhhVista } from "@/components/hr/ReporteRrhh";
import { type CasoArgos, conPendientes, fechaDeDia, hoyBogota, terminado } from "@/lib/casosArgos";
import type { TranslationKey } from "@/lib/i18n";

// Pestaña «Revisión» de Argos (19/11/2026): RR. HH. juzga un caso por persona
// y día. Arriba el día (con cuántos faltan), Casos | Reporte y el filtro.
// El día, la vista y el filtro viven en la URL para volver donde estabas.

type Filtro = "pendientes" | "cometio" | "no_cometio" | "justificado" | "todos";
const FILTROS: Array<{ k: Filtro; etiqueta: TranslationKey }> = [
  { k: "pendientes", etiqueta: "hr.casos.f.pendientes" },
  { k: "cometio", etiqueta: "hr.casos.f.cometio" },
  { k: "no_cometio", etiqueta: "hr.casos.f.noCometio" },
  { k: "justificado", etiqueta: "hr.casos.f.justificado" },
  { k: "todos", etiqueta: "hr.casos.f.todos" },
];

function pasaFiltro(c: CasoArgos, f: Filtro): boolean {
  if (f === "todos") return true;
  if (f === "pendientes") return !c.veredicto;
  return c.veredicto === f;
}

export function Segmentado<T extends string>({ valor, opciones, onCambio }: {
  valor: T; opciones: Array<{ k: T; texto: string }>; onCambio: (k: T) => void;
}) {
  return (
    <div className="flex gap-0.5 overflow-x-auto rounded-control border border-border/60 bg-background/40 p-0.5">
      {opciones.map((o) => (
        <button key={o.k} type="button" onClick={() => onCambio(o.k)}
          className={`shrink-0 rounded-[0.4rem] px-3 py-1.5 text-xs font-semibold transition ${valor === o.k ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function RevisionCasos() {
  const { t } = useLanguage();
  const f = useFormato();
  const [sp, setSp] = useSearchParams();
  const funciones = useFuncionesCasos();
  const dias = useDiasConCasos();
  const hoy = hoyBogota();

  const fijar = (k: string, v: string | null) => setSp((prev) => {
    const n = new URLSearchParams(prev);
    if (v === null) n.delete(k); else n.set(k, v);
    return n;
  }, { replace: true });

  // Día por defecto: el más reciente que ya terminó con pendientes; si no, el más reciente.
  const diaDefecto = useMemo(() => {
    const lista = dias.data ?? [];
    return lista.find((d) => terminado(d.dia, hoy) && conPendientes(d))?.dia ?? lista.find((d) => terminado(d.dia, hoy))?.dia ?? lista[0]?.dia ?? null;
  }, [dias.data, hoy]);
  const dia = sp.get("dia") || diaDefecto;
  const vista = (sp.get("vista") === "reporte" ? "reporte" : "casos") as "casos" | "reporte";
  const filtro = (FILTROS.find((x) => x.k === sp.get("f"))?.k ?? "pendientes") as Filtro;
  const casos = useCasosDelDia(vista === "casos" ? dia : null);

  const etiquetaDia = (d: string) => d === hoy ? t("hr.casos.hoy") : format(fechaDeDia(d), "EEE d MMM", { locale: f.fechas });
  const lista = (casos.data ?? []).filter((c) => pasaFiltro(c, filtro));
  const total = casos.data?.length ?? 0;
  const hechos = (casos.data ?? []).filter((c) => c.veredicto).length;
  const pct = total > 0 ? Math.round((hechos / total) * 100) : 0;
  const mostrarAvance = total !== 0 && !!dia && terminado(dia, hoy);
  const puedeReporte = !!funciones.data && (funciones.data.dueno || funciones.data.reporte || funciones.data.jefe);

  if (dias.isError) {
    return (
      <div className="vidrio flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">{t("hr.casos.errorCargar")}</p>
        <Button variant="outline" size="sm" className="rounded-control" onClick={() => void dias.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.casos.reintentar")}</Button>
      </div>
    );
  }
  if (dias.isLoading) {
    return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if ((dias.data ?? []).length === 0) {
    return (
      <div className="vidrio flex flex-col items-center gap-2 p-10 text-center">
        <p className="text-sm font-semibold text-foreground">{t("hr.casos.vacioTitulo")}</p>
        <p className="max-w-md text-sm text-muted-foreground">{t("hr.casos.vacioSub")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Días */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(dias.data ?? []).slice(0, 14).map((d) => {
          const activo = d.dia === dia;
          const sub = !terminado(d.dia, hoy) ? t("hr.casos.nCasosEnCurso", { n: d.total })
            : conPendientes(d) ? t("hr.casos.nPendientes", { n: d.pendientes }) : t("hr.casos.todoRevisado");
          return (
            <button key={d.dia} type="button" onClick={() => fijar("dia", d.dia)}
              className={`flex shrink-0 flex-col items-start rounded-control border px-3 py-2 text-left transition ${activo ? "border-primary/40 bg-primary/[0.08]" : "border-border/60 bg-background/40 hover:border-border"}`}>
              <span className={`text-xs font-semibold capitalize ${activo ? "text-foreground" : "text-muted-foreground"}`}>{etiquetaDia(d.dia)}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">{sub}</span>
            </button>
          );
        })}
      </div>

      {/* Casos | Reporte · filtro */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {puedeReporte ? (
          <Segmentado valor={vista} onCambio={(k) => fijar("vista", k === "casos" ? null : k)}
            opciones={[{ k: "casos", texto: t("hr.casos.vistaCasos") }, { k: "reporte", texto: t("hr.casos.vistaReporte") }]} />
        ) : <span />}
        {vista === "casos" && (
          <Segmentado valor={filtro} onCambio={(k) => fijar("f", k === "pendientes" ? null : k)}
            opciones={FILTROS.map((x) => ({ k: x.k, texto: t(x.etiqueta) }))} />
        )}
      </div>

      {vista === "reporte" && dia ? <ReporteRrhhVista dia={dia} /> : (
        <>
          {/* Avance del día */}
          {mostrarAvance && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                <span>{t("hr.casos.avance", { a: hechos, b: total })}</span>
                <span className="tabular-nums">{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
                <div className="h-full rounded-full bg-primary/50 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {casos.isError ? (
            <div className="vidrio flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-muted-foreground">{t("hr.casos.errorCargar")}</p>
              <Button variant="outline" size="sm" className="rounded-control" onClick={() => void casos.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.casos.reintentar")}</Button>
            </div>
          ) : casos.isLoading ? (
            <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : lista.length === 0 ? (
            <div className="vidrio p-8 text-center text-sm text-muted-foreground">
              {filtro === "pendientes" && total > 0 ? t("hr.casos.nadaPendiente") : t("hr.casos.nadaEnFiltro")}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {lista.map((c) => <CasoTarjeta key={c.id} caso={c} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Solo los casos pendientes de días que ya terminaron (para el cartel). */
export function CasosPendientes() {
  const { t } = useLanguage();
  const f = useFormato();
  const dias = useDiasConCasos();
  const hoy = hoyBogota();
  const pendientesPorDia = (dias.data ?? []).filter((d) => terminado(d.dia, hoy) && conPendientes(d)).sort((a, b) => a.dia.localeCompare(b.dia));
  if (dias.isLoading) return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (dias.isError) {
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("hr.casos.errorCargar")}</p>
        <Button variant="outline" size="sm" className="rounded-control" onClick={() => void dias.refetch()}>{t("hr.casos.reintentar")}</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {pendientesPorDia.map((d) => (
        <section key={d.dia} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold capitalize text-foreground">
            {format(fechaDeDia(d.dia), "EEEE d MMMM", { locale: f.fechas })} · <span className="font-normal text-muted-foreground">{t("hr.casos.nPendientes", { n: d.pendientes })}</span>
          </h3>
          <PendientesDelDia dia={d.dia} />
        </section>
      ))}
    </div>
  );
}

function PendientesDelDia({ dia }: { dia: string }) {
  const { t } = useLanguage();
  const q = useCasosDelDia(dia);
  if (q.isLoading) return <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (q.isError) return <p className="text-sm text-muted-foreground">{t("hr.casos.errorCargar")}</p>;
  const lista = (q.data ?? []).filter((c) => !c.veredicto && c.puede_juzgar);
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {lista.map((c) => <CasoTarjeta key={c.id} caso={c} />)}
    </div>
  );
}
