import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, HardDrive, TrendingUp, Upload, Users } from "lucide-react";
import EspacioNasBloque, { useResumenNas } from "@/components/centro/EspacioNasBloque";
import ExploradorNas from "@/components/nas/ExploradorNas";
import { CopiaSeguridadNasVista } from "@/components/nas/CopiaSeguridadNas";
import { LiberarNasVista } from "@/components/nas/LiberarNas";
import { ResumenNasVista, type VistaNas } from "@/components/nas/ResumenNas";
import { MasPesadosNasVista, PorTipoNasVista } from "@/components/nas/QueHayNas";
import { Fila, Seccion, useRpcNas, type EstadoDe } from "@/components/nas/comun";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import {
  ALERTA_PCT, LLENO_PCT, nombreConPadre, puntosDeHistoria, tamanoNas,
  type EntroSemana, type FichaNas, type HistoriaNas, type MasPesadosNas, type PorModelo, type PorTipoNas, type QueLiberar,
} from "@/lib/espacioNas";

// EL ÁREA DEL NAS (Alvaro, 10/11/2026): "ver todo lo que hay en el NAS". Se
// entra desde la línea del Centro de operaciones («Entrar al NAS») y desde el
// menú (Oficina › Espacio del NAS). Solo dueño/admin (las RPC también lo
// exigen). Seis pestañas que cargan solo cuando se abren:
//   Resumen     ¿todo corriendo bien? + lo lleno + botones a cada parte (corto)
//   Explorador  buscador por nombre + las carpetas con su peso, nivel por nivel
//   Qué hay     por tipo de archivo, los 50 más pesados y qué ocupa cada modelo
//   Historia    cómo se ha ido llenando y qué entró esta semana
//   Liberar     la papelera de verdad y las copias repetidas, en lenguaje claro
//   Copia       propuestas de copia de seguridad (hoy no hay) + cómo funciona
// Cada sección dice su propio fallo (con Reintentar) sin tumbar las demás.
// Nada se borra desde acá.

export type { EstadoDe };

/** Capacidad de los discos, para las líneas de aviso y tope de la gráfica. */
const CAPACIDAD_TB = 48;

const VISTAS = ["resumen", "explorador", "quehay", "historia", "liberar", "copia"] as const satisfies readonly VistaNas[];
type Vista = (typeof VISTAS)[number];
const CLAVE_VISTA = {
  resumen: "dashboard.centro.nas.vista.resumen",
  explorador: "dashboard.centro.nas.vista.explorador",
  quehay: "dashboard.centro.nas.vista.quehay",
  historia: "dashboard.centro.nas.vista.historia",
  liberar: "dashboard.centro.nas.vista.liberar",
  copia: "dashboard.centro.nas.vista.copia",
} as const;

/** El encabezado estándar de Maven, con «Volver al inicio». */
function Encabezado() {
  const { t } = useLanguage();
  return (
    <PageHeader
      title={t("dashboard.centro.nas.pagina.titulo")}
      subtitle={t("dashboard.centro.nas.pagina.intro")}
      icon={<HardDrive />}
      actions={(
        <Button asChild variant="outline">
          <Link to="/dashboard" aria-label={t("dashboard.centro.nas.pagina.volver")}>
            <ArrowLeft className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">{t("dashboard.centro.nas.pagina.volver")}</span>
          </Link>
        </Button>
      )}
    />
  );
}

/** El contenedor: solo dueño/admin. La pestaña y la carpeta del explorador
 *  viajan en la URL (?vista=…&carpeta=…), así un link lleva al mismo lugar. */
export default function EspacioNasPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { puede, q: resumenQ } = useResumenNas();
  const [params, setParams] = useSearchParams();
  const vista: Vista = (VISTAS as readonly string[]).includes(params.get("vista") ?? "") ? (params.get("vista") as Vista) : "resumen";
  const carpeta = params.get("carpeta");
  const on = (v: Vista) => !!user && puede && vista === v;

  const ir = (v: Vista, extra?: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    p.set("vista", v);
    for (const [k, val] of Object.entries(extra ?? {})) { if (val) p.set(k, val); else p.delete(k); }
    setParams(p, { replace: false });
  };

  const historia = useRpcNas<HistoriaNas>("nas_historia", on("historia"));
  const semana = useRpcNas<EntroSemana>("nas_entro_semana", on("historia"));
  const tipos = useRpcNas<PorTipoNas>("nas_por_tipo", on("quehay"));
  const pesados = useRpcNas<MasPesadosNas>("nas_mas_pesados", on("quehay"));
  const modelos = useRpcNas<PorModelo>("nas_por_modelo", on("quehay"));
  const liberar = useRpcNas<QueLiberar>("nas_que_liberar", on("liberar"));
  const ficha = useRpcNas<FichaNas>("nas_ficha", on("resumen") || on("copia"));

  // <Page> trae el scroll propio: el AppShell recorta lo que se pasa de la pantalla.
  return (
    <Page>
      <Encabezado />
      {!puede ? (
        <p className="vidrio p-4 text-sm text-muted-foreground">{t("dashboard.centro.nas.pagina.soloAdmins")}</p>
      ) : (
        <Tabs value={vista} onValueChange={(v) => ir(v as Vista)} className="flex flex-col gap-4">
          <div className="overflow-x-auto">
            <TabsList>
              {VISTAS.map((v) => <TabsTrigger key={v} value={v}>{t(CLAVE_VISTA[v])}</TabsTrigger>)}
            </TabsList>
          </div>
          <TabsContent value="resumen" className="mt-0">
            <ResumenNasVista bloque={<EspacioNasBloque conEnlace={false} compacto />} resumen={resumenQ.data} ficha={ficha}
              onIr={(v) => ir(v)} />
          </TabsContent>
          <TabsContent value="explorador" className="mt-0">
            <ExploradorNas carpeta={carpeta} on={on("explorador")} onAbrir={(id) => ir("explorador", { carpeta: id })} />
          </TabsContent>
          <TabsContent value="quehay" className="mt-0 flex flex-col gap-4">
            <PorTipoNasVista q={tipos} />
            <MasPesadosNasVista q={pesados} />
            <EspacioNasPaginaVista vista="quehay" resumen={null}
              historia={historia} entro={semana} modelos={modelos} liberar={liberar} />
          </TabsContent>
          <TabsContent value="historia" className="mt-0">
            <EspacioNasPaginaVista vista="historia" resumen={null}
              historia={historia} entro={semana} modelos={modelos} liberar={liberar} />
          </TabsContent>
          <TabsContent value="liberar" className="mt-0">
            <LiberarNasVista q={liberar} />
          </TabsContent>
          <TabsContent value="copia" className="mt-0">
            <CopiaSeguridadNasVista resumen={resumenQ.data} ficha={ficha} />
          </TabsContent>
        </Tabs>
      )}
    </Page>
  );
}

/** La vista: solo dibuja el cuerpo (el marco y el encabezado los pone el contenedor).
 *  Se mira con datos reales en /harness.html?ver=nas-pagina. */
export function EspacioNasPaginaVista({ vista, resumen, historia, entro: semana, modelos, liberar }: {
  /** Qué pestaña dibujar; sin ella dibuja todo (banco visual y pruebas). */
  vista?: "historia" | "quehay" | "liberar";
  resumen: ReactNode;
  historia: EstadoDe<HistoriaNas>; entro: EstadoDe<EntroSemana>; modelos: EstadoDe<PorModelo>; liberar: EstadoDe<QueLiberar>;
}) {
  const { t, language } = useLanguage();
  const loc = language === "es" ? "es-CO" : "en-US";
  const num = (n: number) => n.toLocaleString(loc);
  const tam = (b: number) => tamanoNas(b, language);

  const ver = (v: "historia" | "quehay" | "liberar") => !vista || vista === v;

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Lo de siempre: qué tan lleno está, cuánto falta, qué unidad ocupa más. */}
      {!vista && resumen}

      {ver("historia") && (
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
      )}

      {ver("historia") && (
      <Seccion icono={Upload} titulo={t("dashboard.centro.nas.pagina.semana")} q={semana}
        nota={t("dashboard.centro.nas.pagina.semanaNota")}>
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
      )}

      {ver("quehay") && (
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
      )}

      {ver("liberar") && <LiberarNasVista q={liberar} />}
    </div>
  );
}
