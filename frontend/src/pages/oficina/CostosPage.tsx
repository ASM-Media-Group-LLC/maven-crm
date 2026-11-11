import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, CircleDashed, Loader2, PiggyBank, PlugZap, RefreshCw, Wallet, XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import {
  CATEGORIAS, dondeAhorrar, hacePasMasDe, loQueViene, mensual, peor, resumenCostos, semaforoDeChequeo, usd,
  type ChequeoVivo, type MesCosto, type Semaforo, type ServicioCosto,
} from "@/lib/costos";

// COSTOS Y CONEXIONES (Alvaro, 11/11/2026). Solo el dueño (la ruta usa
// soloDueno y la base también lo exige: RLS de costos_* y conexiones_estado()).
//   Costos      total del mes de Maven, por servicio, lo que viene, dónde
//               ahorrar; las facturas reales las carga Claude en costos_servicios.
//   Conexiones  pruebas EN VIVO contra cada proveedor (edge conexiones-ping) +
//               las señales de la base (crons, correo, Backstage, llamadas…).
// Un fallo se dice como fallo, con Reintentar; nunca como «no hay nada».

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: unknown) => Promise<{ data: any; error: { message: string } | null }> };

const VISTAS = ["costos", "conexiones"] as const;
type Vista = (typeof VISTAS)[number];

const hoyEnColombia = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });

const CLAVE_CATEGORIA: Record<string, TranslationKey> = {
  ia: "oficina.costos.cat.ia", servidores: "oficina.costos.cat.servidores", correos: "oficina.costos.cat.correos", otras: "oficina.costos.cat.otras",
};
const CLAVE_FUENTE: Record<string, TranslationKey> = {
  factura: "oficina.costos.fuente.factura", estimado: "oficina.costos.fuente.estimado", falta: "oficina.costos.fuente.falta",
};
const CLAVE_CONEXION: Record<string, TranslationKey> = {
  app: "oficina.conexiones.app", livekit: "oficina.conexiones.livekit", nas: "oficina.conexiones.nas",
  google_ia: "oficina.conexiones.google", resend: "oficina.conexiones.resend", zoho: "oficina.conexiones.zoho",
  elevenlabs: "oficina.conexiones.elevenlabs", whatsapp: "oficina.conexiones.whatsapp", telegram: "oficina.conexiones.telegram",
  openrouter: "oficina.conexiones.openrouter", anthropic: "oficina.conexiones.anthropic",
};

function Bloque({ icono: Icono, titulo, nota, children }: { icono: typeof Wallet; titulo: string; nota?: ReactNode; children: ReactNode }) {
  return (
    <section className="vidrio sube p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-panel bg-primary/10 text-primary"><Icono className="h-4 w-4" /></span>
        {titulo}
      </h2>
      {nota && <div className="mb-3 max-w-3xl text-xs text-muted-foreground">{nota}</div>}
      {children}
    </section>
  );
}

function Fallo({ onReintentar }: { onReintentar: () => void }) {
  const { t } = useLanguage();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-panel border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1">{t("oficina.costos.fallo")}</span>
      <button type="button" onClick={onReintentar} className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
        <RefreshCw className="h-3.5 w-3.5" />{t("oficina.costos.reintentar")}
      </button>
    </div>
  );
}

const Cargando = () => <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

function Cifra({ valor, etiqueta, nota, tono }: { valor: string; etiqueta: string; nota?: string; tono?: "alerta" | "bien" }) {
  return (
    <div className={`vidrio flex flex-col gap-1 p-4 ${tono === "alerta" ? "border-warning/40" : ""}`}>
      <span className={`font-display text-2xl font-bold tabular-nums ${tono === "alerta" ? "text-warning" : tono === "bien" ? "text-success" : ""}`}>{valor}</span>
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      {nota && <span className="text-[11px] text-muted-foreground/80">{nota}</span>}
    </div>
  );
}

function Pastilla({ fuente }: { fuente: string }) {
  const { t } = useLanguage();
  const tono = fuente === "factura" ? "border-success/40 text-success" : fuente === "estimado" ? "border-warning/40 text-warning" : "border-destructive/40 text-destructive";
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium ${tono}`}>{t(CLAVE_FUENTE[fuente] ?? "oficina.costos.fuente.falta")}</span>;
}

function useCostos() {
  return useQuery({
    queryKey: ["costos"],
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const [s, m] = await Promise.all([
        sinTipar.from("costos_servicios").select("*").order("orden"),
        sinTipar.from("costos_mensuales").select("mes, servicio_id, monto_usd"),
      ]);
      if (s.error) throw new Error(s.error.message);
      if (m.error) throw new Error(m.error.message);
      return { servicios: (s.data ?? []) as ServicioCosto[], meses: (m.data ?? []) as MesCosto[] };
    },
  });
}

function VistaCostos() {
  const { t } = useLanguage();
  const q = useCostos();
  if (q.isLoading) return <Cargando />;
  if (q.isError || !q.data) return <Fallo onReintentar={() => void q.refetch()} />;
  const hoy = hoyEnColombia();
  const { servicios, meses } = q.data;
  const r = resumenCostos(servicios, meses, hoy);
  const viene = loQueViene(servicios, hoy);
  const ahorrar = dondeAhorrar(servicios);
  const faltantes = servicios.filter((s) => s.activo && s.es_maven && s.monto_usd === null);
  const fuera = servicios.filter((s) => s.activo && !s.es_maven);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra valor={usd(r.total)} etiqueta={t("oficina.costos.total")}
          nota={r.faltan ? t("oficina.costos.totalFaltan", { n: r.faltan }) : undefined} />
        <Cifra valor={r.mesPasado === null ? "—" : usd(r.mesPasado)} etiqueta={t("oficina.costos.mesPasado")}
          nota={r.cambioPct === null ? t("oficina.costos.sinMesPasado") : t("oficina.costos.cambio", { p: r.cambioPct > 0 ? `+${r.cambioPct}` : String(r.cambioPct) })}
          tono={r.cambioPct !== null && r.cambioPct > 20 ? "alerta" : undefined} />
        <Cifra valor={usd(r.proximo)} etiqueta={t("oficina.costos.proximo")} tono={r.proximo > r.total ? "alerta" : undefined} />
        <Cifra valor={usd(r.ahorro)} etiqueta={t("oficina.costos.ahorro")} tono="bien" />
      </div>

      {faltantes.length > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-panel border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span className="min-w-0">{t("oficina.costos.faltanFacturas", { lista: faltantes.map((s) => s.proveedor).join(", ") })}</span>
        </div>
      )}

      <Bloque icono={Wallet} titulo={t("oficina.costos.porServicio")} nota={t("oficina.costos.porServicioNota")}>
        <div className="flex flex-col gap-4">
          {CATEGORIAS.map((cat) => {
            const filas = servicios.filter((s) => s.activo && s.es_maven && s.categoria === cat);
            if (!filas.length) return null;
            return (
              <div key={cat} className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold text-primary">{t(CLAVE_CATEGORIA[cat])}</h3>
                <ul className="flex flex-col gap-2">
                  {filas.map((s) => {
                    const m = mensual(s);
                    return (
                      <li key={s.id} className="grid gap-1 rounded-control border border-border/40 p-2.5 md:grid-cols-[minmax(0,14rem)_7rem_5rem_minmax(0,1fr)] md:items-start md:gap-3">
                        <div className="min-w-0"><div className="text-sm font-medium">{s.nombre}</div><div className="text-[11px] text-muted-foreground">{s.proveedor}</div></div>
                        <div className="text-sm tabular-nums">
                          {m === null ? "—" : usd(m)}
                          {s.ciclo === "anual" && s.monto_usd !== null && <div className="text-[11px] text-muted-foreground">{t("oficina.costos.alAno", { m: usd(Number(s.monto_usd)) })}</div>}
                        </div>
                        <div><Pastilla fuente={s.fuente} /></div>
                        <p className="min-w-0 text-xs text-muted-foreground">{s.detalle}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </Bloque>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque icono={CalendarClock} titulo={t("oficina.costos.viene")} nota={t("oficina.costos.vieneNota")}>
          {viene.length === 0 ? <p className="text-sm text-muted-foreground">{t("oficina.costos.nadaViene")}</p> : (
            <ul className="flex flex-col gap-2">
              {viene.map((v) => (
                <li key={v.servicio.id} className="flex items-start gap-3 rounded-control border border-border/40 p-2.5">
                  <span className="w-20 shrink-0 text-xs font-semibold tabular-nums">{v.fecha}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{v.servicio.nombre}{v.monto !== null && <span className={`ml-2 tabular-nums ${v.cambia ? "text-warning" : "text-muted-foreground"}`}>{usd(v.monto)}{v.cambia ? t("oficina.costos.alMesCorto") : ""}</span>}</div>
                    {v.servicio.proximo_detalle && <p className="text-xs text-muted-foreground">{v.servicio.proximo_detalle}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque icono={PiggyBank} titulo={t("oficina.costos.ahorrar")} nota={t("oficina.costos.ahorrarNota")}>
          {ahorrar.length === 0 ? <p className="text-sm text-muted-foreground">{t("oficina.costos.nadaAhorrar")}</p> : (
            <ul className="flex flex-col gap-2">
              {ahorrar.map((s) => (
                <li key={s.id} className="flex items-start gap-3 rounded-control border border-border/40 p-2.5">
                  <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-success">{usd(Number(s.ahorro_usd))}{t("oficina.costos.alMesCorto")}</span>
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium">{s.nombre}</div><p className="text-xs text-muted-foreground">{s.ahorro_detalle}</p></div>
                </li>
              ))}
            </ul>
          )}
        </Bloque>
      </div>

      {fuera.length > 0 && (
        <Bloque icono={Wallet} titulo={t("oficina.costos.fuera", { m: usd(r.fuera) })} nota={t("oficina.costos.fueraNota")}>
          <ul className="flex flex-col gap-2">
            {fuera.map((s) => (
              <li key={s.id} className="text-sm"><span className="font-medium">{s.nombre}</span> · <span className="tabular-nums">{usd(mensual(s) ?? 0)}</span><p className="text-xs text-muted-foreground">{s.detalle}</p></li>
            ))}
          </ul>
        </Bloque>
      )}

      <p className="text-[11px] text-muted-foreground">{t("oficina.costos.pie")}</p>
    </div>
  );
}

// ── Conexiones ─────────────────────────────────────────────────────────────

const ICONO: Record<Semaforo, ReactNode> = {
  ok: <CheckCircle2 className="h-4 w-4 text-success" />,
  atencion: <AlertTriangle className="h-4 w-4 text-warning" />,
  mal: <XCircle className="h-4 w-4 text-destructive" />,
  apagado: <CircleDashed className="h-4 w-4 text-muted-foreground" />,
};

function Linea({ estado, nombre, detalle }: { estado: Semaforo; nombre: string; detalle: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-control border border-border/40 p-2.5">
      <span className="mt-0.5 shrink-0">{ICONO[estado]}</span>
      <div className="min-w-0 flex-1"><div className="text-sm font-medium">{nombre}</div><div className="text-xs text-muted-foreground">{detalle}</div></div>
    </li>
  );
}

interface Base {
  crons: { activos: number; fallando: { job: string; mensaje: string | null; hace_min: number }[]; apagados: string[] };
  correo_equipo: { conectadas: number; con_error: number; sin_sincronizar: number };
  backstage: { llaves: number; ultimo_envio: string | null };
  llamadas: { cortes_1h: number; midiendo_1h: number };
  subidas: { ok_24h: number; fallo_24h: number; trabadas: number };
  nas: { caido: boolean; desde: string | null; pendientes: number } | null;
  incidentes: { tipo: string; mensaje: string; desde: string }[];
  hubstaff: { activo: boolean; ultimo: string | null } | null;
}

function VistaConexiones() {
  const { t } = useLanguage();
  const base = useQuery({
    queryKey: ["conexiones-estado"],
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("conexiones_estado");
      if (error) throw new Error(error.message);
      return data as Base;
    },
  });
  const vivo = useQuery({
    queryKey: ["conexiones-ping"],
    staleTime: 60_000,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("conexiones-ping", { body: {} });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(String(data?.error ?? "error"));
      return data as { en: string; chequeos: ChequeoVivo[] };
    },
  });
  const probar = useMutation({ mutationFn: async () => { await Promise.all([vivo.refetch(), base.refetch()]); } });

  const ahora = Date.now();
  const lineasBase: { id: string; estado: Semaforo; nombre: string; detalle: string }[] = [];
  if (base.data) {
    const b = base.data;
    lineasBase.push({
      id: "crons", nombre: t("oficina.conexiones.crons"),
      estado: b.crons.fallando.length ? "mal" : "ok",
      detalle: b.crons.fallando.length
        ? t("oficina.conexiones.cronsMal", { n: b.crons.fallando.length, lista: b.crons.fallando.map((f) => f.job).join(", ") })
        : t("oficina.conexiones.cronsBien", { n: b.crons.activos }),
    });
    lineasBase.push({
      id: "correo", nombre: t("oficina.conexiones.correoEquipo"),
      estado: b.correo_equipo.con_error ? "atencion" : "ok",
      detalle: t("oficina.conexiones.correoDetalle", { n: b.correo_equipo.conectadas, e: b.correo_equipo.con_error, s: b.correo_equipo.sin_sincronizar }),
    });
    lineasBase.push({
      id: "backstage", nombre: t("oficina.conexiones.backstage"),
      estado: b.backstage.llaves === 0 ? "apagado" : hacePasMasDe(b.backstage.ultimo_envio, 24, ahora) ? "atencion" : "ok",
      detalle: b.backstage.llaves === 0 ? t("oficina.conexiones.backstageSinLlave")
        : b.backstage.ultimo_envio ? t("oficina.conexiones.backstageUltimo", { f: new Date(b.backstage.ultimo_envio).toLocaleString() }) : t("oficina.conexiones.backstageNunca"),
    });
    lineasBase.push({
      id: "llamadas", nombre: t("oficina.conexiones.llamadas"),
      estado: b.llamadas.cortes_1h >= 10 ? "atencion" : "ok",
      detalle: t("oficina.conexiones.llamadasDetalle", { c: b.llamadas.cortes_1h, m: b.llamadas.midiendo_1h }),
    });
    lineasBase.push({
      id: "subidas", nombre: t("oficina.conexiones.subidas"),
      estado: b.subidas.trabadas || b.subidas.fallo_24h ? "atencion" : "ok",
      detalle: t("oficina.conexiones.subidasDetalle", { ok: b.subidas.ok_24h, f: b.subidas.fallo_24h, tr: b.subidas.trabadas }),
    });
    if (b.nas) lineasBase.push({
      id: "nas-base", nombre: t("oficina.conexiones.nasCola"),
      estado: b.nas.caido ? "mal" : b.nas.pendientes > 0 ? "atencion" : "ok",
      detalle: b.nas.caido ? t("oficina.conexiones.nasCaido") : t("oficina.conexiones.nasCola2", { n: b.nas.pendientes }),
    });
    if (b.hubstaff?.activo) lineasBase.push({
      id: "hubstaff", nombre: "Hubstaff",
      estado: hacePasMasDe(b.hubstaff.ultimo, 2, ahora) ? "atencion" : "ok",
      detalle: b.hubstaff.ultimo ? t("oficina.conexiones.hubstaffUltimo", { f: new Date(b.hubstaff.ultimo).toLocaleString() }) : t("oficina.conexiones.backstageNunca"),
    });
  }
  const resumen = peor([
    ...(vivo.data?.chequeos ?? []).map(semaforoDeChequeo),
    ...lineasBase.map((l) => l.estado),
    ...(base.data?.incidentes.length ? ["mal" as const] : []),
  ]);
  const ocupado = vivo.isFetching || base.isFetching;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold">{ICONO[resumen]}{t(resumen === "ok" ? "oficina.conexiones.todoBien" : resumen === "atencion" ? "oficina.conexiones.hayAtencion" : "oficina.conexiones.hayFallas")}</span>
        <Button variant="outline" size="sm" disabled={ocupado} onClick={() => probar.mutate()}>
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" /> : <RefreshCw className="h-4 w-4 sm:mr-1.5" />}
          <span className="hidden sm:inline">{t("oficina.conexiones.probar")}</span>
        </Button>
        {vivo.data && <span className="text-[11px] text-muted-foreground">{t("oficina.conexiones.probadoA", { f: new Date(vivo.data.en).toLocaleTimeString() })}</span>}
      </div>

      {base.data && base.data.incidentes.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 rounded-panel border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {base.data.incidentes.map((i) => <span key={i.tipo}><b>{i.tipo}</b>: {i.mensaje}</span>)}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque icono={PlugZap} titulo={t("oficina.conexiones.servicios")} nota={t("oficina.conexiones.serviciosNota")}>
          {vivo.isLoading ? <Cargando /> : vivo.isError || !vivo.data ? <Fallo onReintentar={() => void vivo.refetch()} /> : (
            <ul className="flex flex-col gap-2">
              {vivo.data.chequeos.map((c) => (
                <Linea key={c.id} estado={semaforoDeChequeo(c)} nombre={CLAVE_CONEXION[c.id] ? t(CLAVE_CONEXION[c.id]) : c.id}
                  detalle={<>{c.detalle}{c.ms !== null && <span className="ml-1 tabular-nums opacity-70">· {c.ms} ms</span>}</>} />
              ))}
            </ul>
          )}
        </Bloque>
        <Bloque icono={PlugZap} titulo={t("oficina.conexiones.adentro")} nota={t("oficina.conexiones.adentroNota")}>
          {base.isLoading ? <Cargando /> : base.isError || !base.data ? <Fallo onReintentar={() => void base.refetch()} /> : (
            <ul className="flex flex-col gap-2">
              {lineasBase.map((l) => <Linea key={l.id} estado={l.estado} nombre={l.nombre} detalle={l.detalle} />)}
            </ul>
          )}
        </Bloque>
      </div>
    </div>
  );
}

export default function CostosPage() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const vista: Vista = (VISTAS as readonly string[]).includes(params.get("vista") ?? "") ? (params.get("vista") as Vista) : "costos";
  return (
    <Page>
      <PageHeader
        title={t("oficina.costos.titulo")}
        subtitle={t("oficina.costos.intro")}
        icon={<Wallet />}
        actions={(
          <Button asChild variant="outline">
            <Link to="/dashboard" aria-label={t("oficina.costos.volver")}>
              <ArrowLeft className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{t("oficina.costos.volver")}</span>
            </Link>
          </Button>
        )}
      />
      <Tabs value={vista} onValueChange={(v) => setParams({ vista: v })} className="flex flex-col gap-4">
        <TabsList className="self-start">
          <TabsTrigger value="costos">{t("oficina.costos.tab.costos")}</TabsTrigger>
          <TabsTrigger value="conexiones">{t("oficina.costos.tab.conexiones")}</TabsTrigger>
        </TabsList>
        <TabsContent value="costos" className="mt-0">{vista === "costos" && <VistaCostos />}</TabsContent>
        <TabsContent value="conexiones" className="mt-0">{vista === "conexiones" && <VistaConexiones />}</TabsContent>
      </Tabs>
    </Page>
  );
}
