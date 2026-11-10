import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowLeft, Copy, HardDrive, Loader2, RefreshCw, Trash2, TrendingUp, Upload, Users } from "lucide-react";
import EspacioNasBloque from "@/components/centro/EspacioNasBloque";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEsDueno } from "@/hooks/useEsDueno";
import { useLanguage } from "@/hooks/useLanguage";
import { useUserRole } from "@/hooks/useUserRole";
import {
  ALERTA_PCT, LLENO_PCT, nombreConPadre, puntosDeHistoria, tamanoNas,
  type EntroSemana, type HistoriaNas, type PorModelo, type QueLiberar,
} from "@/lib/espacioNas";

// PÁGINA COMPLETA DEL ESPACIO DEL NAS (Alvaro, 10/11/2026). Se llega desde el
// bloque del Centro de operaciones («Ver detalle»). Solo dueño/admin (las RPC
// también lo exigen). Cada sección carga sola: si una falla, lo dice y deja
// reintentar sin tumbar las demás. Nada se borra desde acá.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string, a?: unknown) => Promise<{ data: any; error: { message: string } | null }> };

/** Capacidad de los discos, para las líneas de aviso y tope de la gráfica. */
const CAPACIDAD_TB = 48;

function useRpc<T>(rpc: string, on: boolean): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: ["espacio-nas", rpc],
    enabled: on,
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc(rpc);
      if (error) throw new Error(error.message);
      return data as T;
    },
  });
}

/** Lo que la vista necesita de cada consulta (así se puede dibujar con datos fijos). */
export type EstadoDe<T> = Pick<UseQueryResult<T>, "data" | "isLoading" | "isError"> & { refetch: () => unknown };

/** Una sección con su estado: cargando, falló (con reintentar) o el contenido. */
function Seccion<T>({ icono: Icono, titulo, nota, q, children }: {
  icono: typeof HardDrive; titulo: string; nota?: ReactNode; q: EstadoDe<T>; children: (d: T) => ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <section className="vidrio sube p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-panel bg-primary/10 text-primary"><Icono className="h-4 w-4" /></span>
        {titulo}
      </h2>
      {nota && <div className="mb-3 max-w-3xl text-xs text-muted-foreground">{nota}</div>}
      {q.isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : q.isError || !q.data ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-panel border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1">{t("dashboard.centro.nas.fallo")}</span>
          <button type="button" onClick={() => void q.refetch()} className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
            <RefreshCw className="h-3.5 w-3.5" />{t("dashboard.centro.nas.reintentar")}
          </button>
        </div>
      ) : children(q.data)}
    </section>
  );
}

/** Fila de lista con barrita apagada (mismo lenguaje que el bloque del Centro). */
function Fila({ nombre, detalle, valor, pct }: { nombre: ReactNode; detalle?: ReactNode; valor: string; pct: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <span className="truncate text-sm">{nombre}</span>
      <span className="text-right text-xs tabular-nums text-muted-foreground">{valor}</span>
      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary/45" style={{ width: `${Math.min(100, Math.max(1, pct))}%` }} />
      </div>
      {detalle && <span className="col-span-2 -mt-0.5 text-[10px] text-muted-foreground tabular-nums">{detalle}</span>}
    </li>
  );
}

function Encabezado() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-2">
      <Link to="/dashboard" className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />{t("dashboard.centro.nas.pagina.volver")}
      </Link>
      <h1 className="font-display text-2xl font-bold tracking-tight">{t("dashboard.centro.nas.pagina.titulo")}</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">{t("dashboard.centro.nas.pagina.intro")}</p>
    </div>
  );
}

/** El contenedor: solo dueño/admin; pide las cuatro lecturas en paralelo. */
export default function EspacioNasPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { esDueno } = useEsDueno();
  const { isAdmin } = useUserRole();
  const puede = esDueno === true || isAdmin;
  const habilitado = !!user && puede;

  const historia = useRpc<HistoriaNas>("nas_historia", habilitado);
  const semana = useRpc<EntroSemana>("nas_entro_semana", habilitado);
  const modelos = useRpc<PorModelo>("nas_por_modelo", habilitado);
  const liberar = useRpc<QueLiberar>("nas_que_liberar", habilitado);

  if (!puede) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <Encabezado />
        <p className="vidrio p-4 text-sm text-muted-foreground">{t("dashboard.centro.nas.pagina.soloAdmins")}</p>
      </div>
    );
  }
  return (
    <EspacioNasPaginaVista
      resumen={<EspacioNasBloque conEnlace={false} />}
      historia={historia} entro={semana} modelos={modelos} liberar={liberar}
    />
  );
}

/** La vista: solo dibuja (se mira con datos reales en /harness.html?ver=nas-pagina). */
export function EspacioNasPaginaVista({ resumen, historia, entro: semana, modelos, liberar }: {
  resumen: ReactNode;
  historia: EstadoDe<HistoriaNas>; entro: EstadoDe<EntroSemana>; modelos: EstadoDe<PorModelo>; liberar: EstadoDe<QueLiberar>;
}) {
  const { t, language } = useLanguage();
  const loc = language === "es" ? "es-CO" : "en-US";
  const num = (n: number) => n.toLocaleString(loc);
  const tam = (b: number) => tamanoNas(b, language);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <Encabezado />

      {/* Lo de siempre: qué tan lleno está, cuánto falta, qué unidad ocupa más. */}
      {resumen}

      <Seccion icono={TrendingUp} titulo={t("dashboard.centro.nas.pagina.historia")} q={historia}
        nota={t("dashboard.centro.nas.pagina.historiaNota")}>
        {(h) => {
          const puntos = puntosDeHistoria(h, language);
          return (
            <div className="flex flex-col gap-2">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={puntos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="nasRelleno" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval="preserveStartEnd" minTickGap={18} />
                    <YAxis domain={[0, CAPACIDAD_TB]} ticks={[0, 12, 24, 36, 48]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} unit=" TB" width={52} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, color: "hsl(var(--popover-foreground))" }}
                      formatter={(v: number, k: string) => [`${v.toLocaleString(loc, { maximumFractionDigits: 2 })} TB`, k === "tb" ? t("dashboard.centro.nas.pagina.guardado") : t("dashboard.centro.nas.pagina.entroMes")]}
                    />
                    <ReferenceLine y={(CAPACIDAD_TB * ALERTA_PCT) / 100} stroke="hsl(var(--warning))" strokeOpacity={0.6} strokeDasharray="4 4"
                      label={{ value: `${t("dashboard.centro.nas.marcaAlerta")} ${ALERTA_PCT} %`, position: "insideTopLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <ReferenceLine y={(CAPACIDAD_TB * LLENO_PCT) / 100} stroke="hsl(var(--destructive))" strokeOpacity={0.6} strokeDasharray="4 4"
                      label={{ value: `${t("dashboard.centro.nas.marcaLleno")} ${LLENO_PCT} %`, position: "insideTopLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Area type="monotone" dataKey="tb" stroke="hsl(var(--primary))" strokeOpacity={0.8} strokeWidth={2} fill="url(#nasRelleno)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("dashboard.centro.nas.pagina.mediciones", { n: h.muestras.length })}</p>
            </div>
          );
        }}
      </Seccion>

      <Seccion icono={Upload} titulo={t("dashboard.centro.nas.pagina.semana")} q={semana}>
        {(s) => {
          const maxDia = Math.max(1, ...s.por_dia.map((d) => d.bytes));
          const maxModelo = Math.max(1, ...s.por_modelo.map((m) => m.bytes));
          const maxPersona = Math.max(1, ...s.por_persona.map((p) => p.bytes));
          return (
            <div className="flex flex-col gap-4">
              <p className="text-sm">{t("dashboard.centro.nas.pagina.semanaTotal", { tam: tam(s.total.bytes), n: num(s.total.archivos) })}</p>
              {/* Día a día, como columnas chicas. */}
              <div className="flex h-16 items-end gap-1.5">
                {s.por_dia.map((d) => (
                  <div key={d.dia} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${d.dia}: ${tam(d.bytes)}`}>
                    <div className="w-full rounded-t-sm bg-primary/45" style={{ height: `${Math.max(4, (d.bytes / maxDia) * 48)}px` }} />
                    <span className="text-[10px] text-muted-foreground tabular-nums">{d.dia.slice(8)}</span>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{t("dashboard.centro.nas.pagina.dePorLink")}</h3>
                  {s.por_modelo.length === 0 ? <p className="text-xs text-muted-foreground">{t("dashboard.centro.nas.pagina.nadaSemana")}</p> : (
                    <ul className="flex flex-col gap-2">
                      {s.por_modelo.map((m) => (
                        <Fila key={m.carpeta_id} pct={(m.bytes / maxModelo) * 100}
                          nombre={<Link to={`/oficina/drive?carpeta=${m.carpeta_id}`} className="hover:underline">{nombreConPadre(m.nombre, m.padre)}</Link>}
                          valor={`${tam(m.bytes)} · ${num(m.archivos)}`}
                          detalle={m.pidio ? t("dashboard.centro.nas.pagina.pidio", { nombre: m.pidio }) : undefined} />
                      ))}
                    </ul>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{t("dashboard.centro.nas.pagina.delEquipo")}</h3>
                  {s.por_persona.length === 0 ? <p className="text-xs text-muted-foreground">{t("dashboard.centro.nas.pagina.nadaSemana")}</p> : (
                    <ul className="flex flex-col gap-2">
                      {s.por_persona.map((p) => (
                        <Fila key={p.nombre ?? "-"} pct={(p.bytes / maxPersona) * 100}
                          nombre={p.nombre ?? t("dashboard.centro.nas.pagina.sinDueno")}
                          valor={`${tam(p.bytes)} · ${num(p.archivos)}`} />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        }}
      </Seccion>

      <Seccion icono={Users} titulo={t("dashboard.centro.nas.pagina.modelos")} q={modelos}
        nota={modelos.data ? t("dashboard.centro.nas.pagina.modelosNota", { atribuido: tam(modelos.data.atribuido), usado: tam(modelos.data.usado), n: num(modelos.data.cuantas) }) : undefined}>
        {(m) => {
          const max = Math.max(1, ...m.modelos.map((x) => x.bytes));
          return (
            <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {m.modelos.map((x) => (
                <Fila key={x.nombre} pct={(x.bytes / max) * 100} nombre={x.nombre}
                  valor={tam(x.bytes)}
                  detalle={`${t("dashboard.centro.nas.archivos", { n: num(x.archivos) })} · ${t("dashboard.centro.nas.pagina.carpetas", { n: x.carpetas })}`} />
              ))}
            </ul>
          );
        }}
      </Seccion>

      <Seccion icono={Copy} titulo={t("dashboard.centro.nas.pagina.liberar")} q={liberar}>
        {(l) => (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="rounded-panel border border-border/60 bg-card/40 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Copy className="h-3.5 w-3.5" />{t("dashboard.centro.nas.pagina.copias")}</div>
                <div className="mt-1 font-display text-lg font-semibold tabular-nums">{tam(l.copias.bytes)}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{t("dashboard.centro.nas.pagina.copiasNota", { n: num(l.copias.copias_de_mas) })}</div>
              </div>
              <div className="rounded-panel border border-border/60 bg-card/40 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Trash2 className="h-3.5 w-3.5" />{t("dashboard.centro.nas.pagina.papelera")}</div>
                <div className="mt-1 font-display text-lg font-semibold tabular-nums">{tam(l.papelera.bytes)}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{t("dashboard.centro.nas.pagina.papeleraNota", { n: num(l.papelera.archivos) })}</div>
              </div>
            </div>
            {l.top.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">{t("dashboard.centro.nas.pagina.copiasAviso")}</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-[11px] text-muted-foreground">
                        <th className="py-1.5 pr-3 font-medium">{t("dashboard.centro.nas.pagina.archivo")}</th>
                        <th className="py-1.5 pr-3 text-right font-medium">{t("dashboard.centro.nas.pagina.peso")}</th>
                        <th className="py-1.5 pr-3 text-right font-medium">{t("dashboard.centro.nas.pagina.veces")}</th>
                        <th className="py-1.5 pr-3 text-right font-medium">{t("dashboard.centro.nas.pagina.recupera")}</th>
                        <th className="py-1.5 font-medium">{t("dashboard.centro.nas.pagina.dondeEsta")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {l.top.map((c) => (
                        <tr key={`${c.nombre}-${c.size}`} className="border-b border-border/30 last:border-0">
                          <td className="max-w-[16rem] truncate py-1.5 pr-3" title={c.nombre}>{c.nombre}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{tam(c.size)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{c.copias}</td>
                          <td className="py-1.5 pr-3 text-right font-medium tabular-nums">{tam(c.recupera)}</td>
                          <td className="max-w-[14rem] truncate py-1.5 text-xs text-muted-foreground">
                            {c.unidades.map((u) => u || t("dashboard.centro.nas.miUnidad")).join(" · ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Seccion>
    </div>
  );
}
