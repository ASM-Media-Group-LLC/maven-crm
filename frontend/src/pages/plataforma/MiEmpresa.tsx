import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowUpRight, Brain, Clock, CreditCard, FileText, Lock, Mail, MessageSquare, MonitorPlay, Video, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import type { ResumenDeMiEmpresa } from "@/lib/plataforma";
import { organizacionAMostrar } from "@/lib/plataforma/acceso";
import { RECARGA_PAGAS_USD, RECARGA_RECIBES_USD, formatoUsd } from "@/lib/plataforma/planes";
import { usePlataforma } from "./contexto";
import { Baldosa, BarraDeUso, Cargando, Chip, ErrorConReintento, useTextoDeError } from "./piezas";
import { PendientesDelCliente } from "./Pendientes";
import { ListaDePersonas } from "./Personas";

// /mi-empresa — LO QUE VE EL ADMIN DEL CLIENTE (también la plataforma al «Entrar»
// a un cliente, con la lista de pendientes arriba). Cabecera con su logo y
// «X · powered by Maven», su plan y las personas usadas (se bloquea lleno), el
// saldo de Argos con «Recargar», su gente y, sobre todo, que el admin ve de su
// empresa lo mismo que el dueño ve hoy en Kash: Cowork en vivo, Argos, cámaras y
// llamadas (son los módulos de siempre de Maven).

export function useResumen() {
  const p = usePlataforma();
  const [params] = useSearchParams();
  const org = p.yo ? organizacionAMostrar(p.yo, params.get("org") ?? p.verComo?.organizacion_id) : null;
  const q = useQuery({ queryKey: ["plataforma", "resumen", org], queryFn: () => p.datos.resumenDeMiEmpresa(org!), enabled: !!org });
  return { org, q };
}

/** «Nova Studio · powered by Maven», con su logo. */
export function CabeceraDeMarca({ r, children }: { r: ResumenDeMiEmpresa; children?: ReactNode }) {
  const { t } = useLanguage();
  const o = r.organizacion;
  const marca = o.marca.nombre || o.nombre;
  return (
    <div className="vidrio vidrio-glow glow-suave overflow-hidden" data-cabecera>
      <div className="v-cont flex flex-wrap items-center gap-4 p-5">
        <div className="flex h-16 min-w-16 items-center justify-center rounded-2xl px-3" style={{ background: o.marca.color || "#334155" }}>
          {o.marca.logo_url
            ? <img src={o.marca.logo_url} alt={marca} className="max-h-10 max-w-[180px] object-contain" />
            : <span className="text-2xl font-semibold text-white">{marca.trim()[0]?.toUpperCase()}</span>}
        </div>
        <PageHeader
          className="min-w-0 flex-1"
          title={<>{marca} <span className="text-base font-normal text-muted-foreground">· {t("plataforma.poweredBy")}</span></>}
          subtitle={<span className="mt-1 flex flex-wrap items-center gap-1.5">
            {o.estado === "preparacion" && <Chip tono="alerta" punto>{t("plataforma.chip.preparacion")}</Chip>}
            {o.estado === "activa" && <Chip tono="bien" punto>{t("plataforma.chip.activa")}</Chip>}
            {o.es_demo && <Chip punto>{t("plataforma.chip.demo")}</Chip>}
          </span>}
        />
        {children}
      </div>
    </div>
  );
}

export default function MiEmpresa() {
  const { t } = useLanguage();
  const p = usePlataforma();
  const { org, q } = useResumen();

  if (!org) return null;
  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorConReintento error={q.error} onReintentar={() => q.refetch()} />;
  const r = q.data!;
  const rolVisto = p.verComo?.rol ?? "admin_cliente";

  if (rolVisto === "empleado" || rolVisto === "supervisor") return <VistaDeEquipo r={r} rol={rolVisto} />;

  const lleno = r.paquete > 0 && r.ocupadas >= r.paquete;
  const bloqueado = r.estado_cobro === "bloqueado";
  const puedeEditar = !p.verComo && !bloqueado;

  return (
    <Page>
    <div className="flex flex-col gap-5">
      {p.esPlataforma && !p.verComo && (
        <Link to="/plataforma" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />{t("plataforma.volverClientes")}
        </Link>
      )}
      {p.esPlataforma && !p.verComo && (
        <PendientesDelCliente org={org} marca={{ ...r.organizacion.marca, nombreCliente: r.organizacion.nombre }} />
      )}

      <CabeceraDeMarca r={r} />
      <AvisosDeCobro r={r} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Baldosa
          etiqueta={t("plataforma.mi.plan")}
          valor={<span>{r.ocupadas}<span className="text-base font-normal text-muted-foreground"> / {r.paquete}</span></span>}
          tono={lleno ? "mal" : undefined}
          pie={<div className="flex flex-col gap-1.5">
            <BarraDeUso usadas={r.ocupadas} total={r.paquete} />
            <span>{r.organizacion.plan ? t(`plataforma.plan.${r.organizacion.plan.nombre}`) : "—"}{lleno ? ` · ${t("plataforma.mi.lleno")}` : ` · ${t("plataforma.mi.libres", { n: Math.max(0, r.paquete - r.ocupadas) })}`}</span>
          </div>}
        />
        <Baldosa etiqueta={t("plataforma.mi.enVivo")} valor={r.en_vivo} vivo={r.en_vivo > 0}
          pie={<Link to="/cowork" className="inline-flex items-center gap-1 text-primary hover:underline">{t("plataforma.mi.verCowork")}<ArrowUpRight className="h-3 w-3" /></Link>} />
        <Baldosa etiqueta={t("plataforma.mi.notaArgos")} valor={r.nota_argos_hoy ?? "—"}
          pie={<Link to="/hr/monitor-ia" className="inline-flex items-center gap-1 text-primary hover:underline">{t("plataforma.mi.verArgos")}<ArrowUpRight className="h-3 w-3" /></Link>} />
        <SaldoDeArgos r={r} org={org} />
      </div>

      <section className="vidrio p-5" data-como-el-dueno>
        <h2 className="text-base font-semibold">{t("plataforma.mi.comoDueno")}</h2>
        <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{t("plataforma.mi.comoDuenoSub")}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { to: "/cowork", icono: MonitorPlay, k: "plataforma.modulo.cowork" },
            { to: "/hr/monitor-ia", icono: Brain, k: "plataforma.modulo.argos" },
            { to: "/meet", icono: Video, k: "plataforma.modulo.llamadas" },
            { to: "/messenger", icono: MessageSquare, k: "plataforma.modulo.messenger" },
            { to: "/correo", icono: Mail, k: "plataforma.modulo.correo" },
            { to: "/oficina", icono: FileText, k: "plataforma.modulo.oficina" },
          ].map((m) => (
            <Link key={m.to} to={m.to} className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted/50">
              <m.icono className="h-4 w-4 text-primary" />{t(m.k as Parameters<typeof t>[0])}
            </Link>
          ))}
        </div>
      </section>

      <ListaDePersonas org={org} ocupadas={r.ocupadas} paquete={r.paquete} puedeEditar={puedeEditar} />
    </div>
    </Page>
  );
}

function SaldoDeArgos({ r, org }: { r: ResumenDeMiEmpresa; org: string }) {
  const { t } = useLanguage();
  const p = usePlataforma();
  const qc = useQueryClient();
  const textoError = useTextoDeError();
  // Recarga con tarjeta: el admin del cliente (su dinero) y el dueño. Grace no toca cobros.
  const puedeRecargar = !p.verComo && !p.mostrandoACliente && (p.yo?.tipo === "admin_cliente" || p.yo?.tipo === "dueno");
  const recargar = useMutation({
    mutationFn: () => p.datos.iniciarRecarga(org),
    onSuccess: (res) => {
      if (res.url) { window.location.href = res.url; return; }
      toast.success(t("plataforma.argos.recargado", { usd: formatoUsd(RECARGA_RECIBES_USD) }));
      qc.invalidateQueries({ queryKey: ["plataforma"] });
    },
    onError: (e) => toast.error(textoError(e)),
  });
  return (
    <Baldosa
      etiqueta={t("plataforma.mi.saldoArgos")}
      valor={r.argos.pausado ? t("plataforma.argos.pausadoCorto") : formatoUsd(r.argos.saldo_usd, 2)}
      tono={r.argos.pausado ? "mal" : r.argos.saldo_usd < 10 ? "alerta" : undefined}
      pie={<div className="flex flex-col gap-2">
        <span>{r.argos.argos_usd_mes ? t("plataforma.argos.incluido", { usd: formatoUsd(r.argos.argos_usd_mes) }) : t("plataforma.argos.seAcumula")}</span>
        {puedeRecargar && (
          <div className="flex flex-col items-start gap-1">
            <Button size="sm" variant={r.argos.pausado ? "default" : "outline"} onClick={() => recargar.mutate()} disabled={recargar.isPending} data-recargar>
              <Wallet className="mr-1.5 h-3.5 w-3.5" />{t("plataforma.argos.recargarBoton")}
            </Button>
            <span className="text-[11px]">{t("plataforma.argos.recargar", { pagas: formatoUsd(RECARGA_PAGAS_USD), recibes: formatoUsd(RECARGA_RECIBES_USD) })}</span>
          </div>
        )}
      </div>}
    />
  );
}

/** Pago fallido → 7 días de gracia → bloqueado (nadie entra, nada se borra). Prueba de 14 días. Argos sin saldo. */
export function AvisosDeCobro({ r }: { r: ResumenDeMiEmpresa }) {
  const { t } = useLanguage();
  const p = usePlataforma();
  const pagos = p.esPlataforma ? `/mi-empresa/plan?org=${r.organizacion.id}` : "/mi-empresa/plan";
  const avisos: { k: string; tono: "alerta" | "mal"; icono: typeof AlertTriangle; texto: string; accion?: string }[] = [];
  if (r.estado_cobro === "gracia") avisos.push({ k: "gracia", tono: "alerta", icono: CreditCard, texto: t("plataforma.cobro.graciaAviso"), accion: t("plataforma.cobro.actualizarTarjeta") });
  if (r.estado_cobro === "bloqueado") avisos.push({ k: "bloqueado", tono: "mal", icono: Lock, texto: t("plataforma.cobro.bloqueadoAviso"), accion: t("plataforma.cobro.actualizarTarjeta") });
  if (r.estado_cobro === "prueba") avisos.push({ k: "prueba", tono: "alerta", icono: Clock, texto: t("plataforma.cobro.pruebaAviso") });
  if (r.argos.pausado && r.organizacion.estado === "activa") avisos.push({ k: "argos", tono: "mal", icono: Wallet, texto: t("plataforma.argos.pausadoAviso") });
  if (avisos.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {avisos.map((a) => (
        <div key={a.k} role="alert" data-aviso={a.k}
          className={a.tono === "mal"
            ? "flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            : "flex flex-wrap items-center gap-3 rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-warning"}>
          <a.icono className="h-4 w-4 shrink-0" />
          <span className="flex-1">{a.texto}</span>
          {a.accion && !p.mostrandoACliente && (
            <Link to={pagos} className="font-semibold underline-offset-4 hover:underline">{a.accion}</Link>
          )}
        </div>
      ))}
    </div>
  );
}

/** «Ver como» empleado o supervisor: lo que esa persona ve de Maven (solo lectura). */
function VistaDeEquipo({ r, rol }: { r: ResumenDeMiEmpresa; rol: "empleado" | "supervisor" }) {
  const { t } = useLanguage();
  const modulos = [
    { icono: MonitorPlay, k: "plataforma.modulo.cowork" },
    { icono: MessageSquare, k: "plataforma.modulo.messenger" },
    { icono: Mail, k: "plataforma.modulo.correo" },
    { icono: FileText, k: "plataforma.modulo.oficina" },
    ...(rol === "supervisor" ? [{ icono: Brain, k: "plataforma.modulo.argosEquipo" }] : []),
  ];
  return (
    <Page>
    <div className="flex flex-col gap-5">
      <CabeceraDeMarca r={r} />
      <section className="vidrio p-5">
        <h2 className="text-base font-semibold">{t(rol === "supervisor" ? "plataforma.vista.supervisor" : "plataforma.vista.empleado")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t(rol === "supervisor" ? "plataforma.vista.supervisorSub" : "plataforma.vista.empleadoSub")}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {modulos.map((m) => (
            <div key={m.k} className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-3 text-sm font-medium">
              <m.icono className="h-4 w-4 text-primary" />{t(m.k as Parameters<typeof t>[0])}
            </div>
          ))}
        </div>
      </section>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Baldosa etiqueta={t("plataforma.vista.miNota")} valor={r.nota_argos_hoy ?? "—"} pie={t("plataforma.vista.miNotaPie")} />
        <Baldosa etiqueta={t("plataforma.mi.enVivo")} valor={r.en_vivo} vivo={r.en_vivo > 0} />
        <Baldosa etiqueta={t("plataforma.vista.sinPrecios")} valor={<Lock className="h-5 w-5 text-muted-foreground" />} pie={t("plataforma.vista.sinPreciosPie")} />
      </div>
    </div>
    </Page>
  );
}
