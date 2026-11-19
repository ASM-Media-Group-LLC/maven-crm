import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowDownRight, ArrowUpRight, BarChart3, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { UserAvatar } from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import { useFotosCaso } from "@/hooks/useCasosArgos";
import { Segmentado } from "@/components/hr/RevisionCasos";
import { fechaDeDia, hoyBogota } from "@/lib/casosArgos";

// RESUMEN DE ARGOS (Alvaro, 19/11/2026): lo importante sin revisar 3.000 avisos.
// Día: los 5 que peor estuvieron (con qué pasó y la foto) y los 5 mejores.
// Semana: quién mejora y quién empeora (minutos marcados por hora trabajada).
// La base decide a quién ve cada uno: el jefe, su equipo; el dueño, a todos.

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
const db = supabase as unknown as RpcDb;

interface Peor { id: string; user_id: string; nombre: string; puesto: string | null; gravedad: number; que: string; foto_path: string | null; veredicto: string | null }
interface Mejor { user_id: string; nombre: string; puesto: string | null; medido_min: number; marcados_min: number }
interface ResumenDia { dia: string; medidas: number; casos: number; peores: Peor[]; mejores: Mejor[] }
interface FilaTendencia { user_id: string; nombre: string; puesto: string | null; horas: number; por_hora: number; por_hora_antes: number }
interface Tendencia { semana: string; comparadas: number; mejoran: FilaTendencia[]; empeoran: FilaTendencia[] }

function Error({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="vidrio flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-sm text-muted-foreground">{t("hr.resumenJefes.error")}</p>
      <Button variant="outline" size="sm" className="rounded-control" onClick={onRetry}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.casos.reintentar")}</Button>
    </div>
  );
}

function FilaPeor({ p }: { p: Peor }) {
  const fotos = useFotosCaso(p.foto_path ? [p.foto_path] : []);
  const url = p.foto_path ? fotos.data?.[p.foto_path] : undefined;
  return (
    <li className="flex items-start gap-3 py-3">
      <UserAvatar name={p.nombre} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{p.nombre}</p>
        {p.puesto && <p className="truncate text-xs text-muted-foreground">{p.puesto}</p>}
        <p className="mt-1 text-xs text-destructive">{p.que}</p>
      </div>
      {url && <img src={url} alt="" loading="lazy" className="h-14 w-24 shrink-0 rounded-control border border-border/50 object-cover" />}
    </li>
  );
}

function VistaDia({ dia }: { dia: string }) {
  const { t } = useLanguage();
  const q = useQuery<ResumenDia>({
    queryKey: ["argos-resumen-dia", dia],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("argos_resumen_dia", { _dia: dia });
      if (error) throw new globalThis.Error(error.message);
      return data as ResumenDia;
    },
  });
  if (q.isLoading) return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (q.isError || !q.data) return <Error onRetry={() => void q.refetch()} />;
  const r = q.data;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="vidrio flex flex-col p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-destructive" />{t("hr.resumenJefes.peores")}
        </h3>
        {r.peores.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{t("hr.resumenJefes.nadieMarcado")}</p> : (
          <ul className="divide-y divide-border/40">{r.peores.map((p) => <FilaPeor key={p.id} p={p} />)}</ul>
        )}
      </section>
      <section className="vidrio flex flex-col p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />{t("hr.resumenJefes.mejores")}
        </h3>
        {r.mejores.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{t("hr.resumenJefes.sinMedidas")}</p> : (
          <ul className="divide-y divide-border/40">
            {r.mejores.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 py-3">
                <UserAvatar name={m.nombre} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{m.nombre}</p>
                  {m.puesto && <p className="truncate text-xs text-muted-foreground">{m.puesto}</p>}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {t("hr.resumenJefes.horasYMarcas", { h: (m.medido_min / 60).toFixed(1), m: m.marcados_min })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-muted-foreground lg:col-span-2">{t("hr.resumenJefes.pieDia", { n: r.medidas, c: r.casos })}</p>
    </div>
  );
}

function ListaTendencia({ filas, tono }: { filas: FilaTendencia[]; tono: "bien" | "mal" }) {
  const { t } = useLanguage();
  const Flecha = tono === "bien" ? ArrowDownRight : ArrowUpRight;
  if (filas.length === 0) return <p className="py-6 text-sm text-muted-foreground">{t("hr.resumenJefes.nadie")}</p>;
  return (
    <ul className="divide-y divide-border/40">
      {filas.map((f) => (
        <li key={f.user_id} className="flex items-center gap-3 py-3">
          <UserAvatar name={f.nombre} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{f.nombre}</p>
            <p className="truncate text-xs text-muted-foreground">{t("hr.resumenJefes.horasSemana", { h: f.horas })}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums ${tono === "bien" ? "text-success" : "text-destructive"}`}>
            {f.por_hora_antes} → {f.por_hora}<Flecha className="h-3.5 w-3.5" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function VistaSemana() {
  const { t } = useLanguage();
  const f = useFormato();
  const q = useQuery<Tendencia>({
    queryKey: ["argos-tendencia-semana"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("argos_tendencia_semana");
      if (error) throw new globalThis.Error(error.message);
      return data as Tendencia;
    },
  });
  if (q.isLoading) return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (q.isError || !q.data) return <Error onRetry={() => void q.refetch()} />;
  const r = q.data;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {t("hr.resumenJefes.semanaDe", { d: format(fechaDeDia(r.semana), "d MMM", { locale: f.fechas }) })} · {t("hr.resumenJefes.explicaSemana")}
      </p>
      {r.comparadas === 0 ? (
        <div className="vidrio p-8 text-center text-sm text-muted-foreground">{t("hr.resumenJefes.sinComparar")}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="vidrio p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><span className="h-1.5 w-1.5 rounded-full bg-success" />{t("hr.resumenJefes.mejoran")}</h3>
            <ListaTendencia filas={r.mejoran} tono="bien" />
          </section>
          <section className="vidrio p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><span className="h-1.5 w-1.5 rounded-full bg-destructive" />{t("hr.resumenJefes.empeoran")}</h3>
            <ListaTendencia filas={r.empeoran} tono="mal" />
          </section>
        </div>
      )}
    </div>
  );
}

export default function ResumenArgos() {
  const { t } = useLanguage();
  const f = useFormato();
  const [sp, setSp] = useSearchParams();
  const hoy = hoyBogota();
  const vista = sp.get("vista") === "semana" ? "semana" : "dia";
  const dia = sp.get("dia") || hoy;
  const fijar = (k: string, v: string | null) => setSp((prev) => {
    const n = new URLSearchParams(prev);
    if (v === null) n.delete(k); else n.set(k, v);
    return n;
  }, { replace: true });
  const ultimos = Array.from({ length: 7 }, (_, i) => {
    const d = fechaDeDia(hoy);
    d.setDate(d.getDate() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  return (
    <Page>
      <PageHeader title={t("hr.resumenJefes.titulo")} subtitle={t("hr.resumenJefes.sub")} icon={<BarChart3 className="h-5 w-5" />} />
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Segmentado valor={vista} onCambio={(k) => fijar("vista", k === "dia" ? null : k)}
            opciones={[{ k: "dia", texto: t("hr.resumenJefes.vistaDia") }, { k: "semana", texto: t("hr.resumenJefes.vistaSemana") }]} />
          {vista === "dia" && (
            <div className="flex gap-1 overflow-x-auto">
              {ultimos.map((d) => (
                <button key={d} type="button" onClick={() => fijar("dia", d === hoy ? null : d)}
                  className={`shrink-0 rounded-control border px-2.5 py-1 text-xs font-medium capitalize transition ${d === dia ? "border-primary/40 bg-primary/[0.08] text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>
                  {d === hoy ? t("hr.casos.hoy") : format(fechaDeDia(d), "EEE d", { locale: f.fechas })}
                </button>
              ))}
            </div>
          )}
        </div>
        {vista === "dia" ? <VistaDia dia={dia} /> : <VistaSemana />}
        <Link to="/hr/monitor-ia" className="text-sm font-medium text-primary hover:underline">{t("hr.resumenJefes.irArgos")}</Link>
      </div>
    </Page>
  );
}
