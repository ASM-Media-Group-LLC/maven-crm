import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { hacePasMasDe, peor, semaforoDeChequeo, type ChequeoVivo, type Semaforo } from "@/lib/costos";
import { Cargando, FalloCompacto, Pastilla, Punto, fechaCorta, hoyEnColombia, useCostos } from "./comun";

// CONEXIONES (Alvaro, 13/11/2026; diseño del mockup propuesta-argos/
// Conexiones.dc.html). Cuatro fichas arriba (funcionan / con alerta / fallando
// / sin acceso) y dos listas: «Servicios externos» (la edge conexiones-ping
// pregunta en vivo a cada proveedor, solo lectura; más el dominio y las cuentas
// que no se pueden ver, de costos_servicios) y «Dentro de Maven» (la RPC
// conexiones_estado: tareas automáticas, correo, Backstage, llamadas, subidas,
// NAS y los incidentes abiertos, como «Argos sin juzgar»). Cada fila: puntito,
// nombre, qué pasa en palabras, estado y qué hacer. Si una parte no carga es UNA
// fila con Reintentar, nunca una caja roja ni un «no hay nada».

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string, a?: unknown) => Promise<{ data: any; error: { message: string } | null }> };

const CLAVE_CONEXION: Record<string, TranslationKey> = {
  app: "oficina.conexiones.app", livekit: "oficina.conexiones.livekit", nas: "oficina.conexiones.nas",
  google_ia: "oficina.conexiones.google", resend: "oficina.conexiones.resend", zoho: "oficina.conexiones.zoho",
  elevenlabs: "oficina.conexiones.elevenlabs", whatsapp: "oficina.conexiones.whatsapp", telegram: "oficina.conexiones.telegram",
  openrouter: "oficina.conexiones.openrouter", anthropic: "oficina.conexiones.anthropic",
};
/** Qué hacer cuando un servicio de afuera falla. */
const ACCION_EXTERNA: Record<string, TranslationKey> = {
  app: "oficina.conexiones.accion.app", livekit: "oficina.conexiones.accion.livekit", nas: "oficina.conexiones.accion.nas",
  google_ia: "oficina.conexiones.accion.google", resend: "oficina.conexiones.accion.resend", zoho: "oficina.conexiones.accion.zoho",
  elevenlabs: "oficina.conexiones.accion.elevenlabs", whatsapp: "oficina.conexiones.accion.puente", telegram: "oficina.conexiones.accion.puente",
  openrouter: "oficina.conexiones.accion.llave", anthropic: "oficina.conexiones.accion.llave",
};

export const COLOR_ESTADO: Record<Semaforo, string> = {
  ok: "hsl(var(--success))",
  atencion: "hsl(var(--warning))",
  mal: "hsl(var(--destructive))",
  apagado: "hsl(var(--muted-foreground) / 0.55)",
};
const RANGO: Record<Semaforo, number> = { mal: 0, atencion: 1, ok: 2, apagado: 3 };
const PASTILLA: Record<Semaforo, TranslationKey> = {
  ok: "oficina.conexiones.estado.ok",
  atencion: "oficina.conexiones.estado.atencion",
  mal: "oficina.conexiones.estado.mal",
  apagado: "oficina.conexiones.estado.sinAcceso",
};

interface Fila { id: string; estado: Semaforo; nombre: string; detalle: ReactNode; pastilla?: string; accion?: string }

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

function FilaConexion({ f }: { f: Fila }) {
  const { t } = useLanguage();
  return (
    <li className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-border/40 px-4 py-3 sm:px-5">
      <Punto color={COLOR_ESTADO[f.estado]} className="h-2.5 w-2.5" />
      <div className="flex min-w-0 flex-[1_1_15rem] flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{f.nombre}</span>
        <span className="break-words text-xs text-muted-foreground">{f.detalle}</span>
      </div>
      {/* La pastilla y «qué hacer» en columnas fijas: las pastillas quedan alineadas. */}
      <div className="flex basis-full items-start justify-between gap-3 pl-6 sm:basis-auto sm:items-center sm:justify-end sm:pl-0">
        <span className="sm:flex sm:w-32 sm:justify-end"><Pastilla color={COLOR_ESTADO[f.estado]}>{f.pastilla ?? t(PASTILLA[f.estado])}</Pastilla></span>
        <span className="text-right text-xs text-muted-foreground sm:w-60">{f.accion ?? ""}</span>
      </div>
    </li>
  );
}

function Grupo({ titulo, sub, filas, cargando, fallos }: {
  titulo: string; sub: string; filas: Fila[]; cargando: boolean; fallos: ReactNode[];
}) {
  return (
    <section className="vidrio sube overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3.5 sm:px-5">
        <h2 className="text-[15px] font-semibold text-foreground">{titulo}</h2>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </div>
      <ul className="flex flex-col">
        {fallos.map((f, i) => <li key={i} className="border-t border-border/40">{f}</li>)}
        {cargando && <li className="border-t border-border/40"><Cargando alto="py-5" /></li>}
        {filas.map((f) => <FilaConexion key={f.id} f={f} />)}
      </ul>
    </section>
  );
}

const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);

export default function VistaConexiones() {
  const { t, language } = useLanguage();
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
  const costos = useCostos();
  const probar = useMutation({ mutationFn: async () => { await Promise.all([vivo.refetch(), base.refetch(), costos.refetch()]); } });
  const ahora = Date.now();
  const hoy = hoyEnColombia();
  const fecha = (iso: string) => new Date(iso).toLocaleString(language, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  // ── Servicios externos: la prueba en vivo y, de costos, el dominio y lo que no se puede ver.
  const externos: Fila[] = [];
  const probados = new Set<string>();
  for (const c of vivo.data?.chequeos ?? []) {
    probados.add(c.id);
    const estado = semaforoDeChequeo(c);
    externos.push({
      id: c.id, estado,
      nombre: CLAVE_CONEXION[c.id] ? t(CLAVE_CONEXION[c.id]) : c.id,
      detalle: <>{c.detalle}{c.ms !== null && estado === "ok" && <span className="tabular-nums opacity-70"> · {c.ms} ms</span>}</>,
      pastilla: estado === "apagado" ? t("oficina.conexiones.estado.sinConfigurar") : undefined,
      accion: estado === "ok" ? undefined : estado === "apagado" ? t("oficina.conexiones.accion.sinConfigurar") : t(ACCION_EXTERNA[c.id] ?? "oficina.conexiones.accion.llave"),
    });
  }
  for (const s of costos.data?.servicios ?? []) {
    if (!s.activo || !s.es_maven || probados.has(s.id)) continue;
    if (s.ciclo === "anual" && s.proximo_cobro && s.proximo_cobro >= hoy) {
      const n = diasEntre(hoy, s.proximo_cobro);
      const cerca = n <= 45;
      externos.push({
        id: `costo-${s.id}`, estado: cerca ? "atencion" : "ok", nombre: s.nombre,
        detalle: [t("oficina.conexiones.renueva", { f: fechaCorta(s.proximo_cobro, language) }), s.detalle].filter(Boolean).join(" · "),
        pastilla: cerca ? t("oficina.conexiones.estado.vence", { n }) : undefined,
        accion: cerca ? t("oficina.conexiones.accion.dominio") : undefined,
      });
    } else if (s.fuente === "falta") {
      externos.push({
        id: `costo-${s.id}`, estado: "apagado", nombre: s.nombre, detalle: s.revisado ?? s.detalle ?? "",
        accion: t("oficina.conexiones.accion.sinAcceso"),
      });
    }
  }
  externos.sort((a, b) => RANGO[a.estado] - RANGO[b.estado]);

  // ── Dentro de Maven: lo que vive en la base, con los incidentes abiertos en su fila.
  const adentro: Fila[] = [];
  if (base.data) {
    const b = base.data;
    const inc = new Map(b.incidentes.map((i) => [i.tipo, i]));
    const conIncidente = (f: Fila, tipo: string): Fila => {
      const i = inc.get(tipo);
      inc.delete(tipo);
      return i ? { ...f, estado: "mal", pastilla: undefined, detalle: <>{i.mensaje} · {t("oficina.conexiones.desde", { f: fecha(i.desde) })}</> } : f;
    };
    adentro.push(conIncidente({
      id: "crons", nombre: t("oficina.conexiones.crons"),
      estado: b.crons.fallando.length ? "mal" : "ok",
      pastilla: b.crons.fallando.length ? t("oficina.conexiones.estado.nFallando", { n: b.crons.fallando.length }) : undefined,
      detalle: b.crons.fallando.length
        ? t("oficina.conexiones.cronsMal", { n: b.crons.fallando.length, lista: b.crons.fallando.map((f) => f.job).join(", ") })
        : t("oficina.conexiones.cronsBien", { n: b.crons.activos }),
      accion: b.crons.fallando.length ? t("oficina.conexiones.accion.crons") : undefined,
    }, "cron_parado"));
    const argos = inc.get("argos_sin_juzgar");
    if (argos) {
      inc.delete("argos_sin_juzgar");
      adentro.push({
        id: "argos", nombre: t("oficina.conexiones.argos"), estado: "atencion", pastilla: t("oficina.conexiones.estado.detenido"),
        detalle: <>{argos.mensaje} · {t("oficina.conexiones.desde", { f: fecha(argos.desde) })}</>,
        accion: t("oficina.conexiones.accion.argos"),
      });
    }
    adentro.push(conIncidente({
      id: "correo", nombre: t("oficina.conexiones.correoEquipo"),
      estado: b.correo_equipo.con_error ? "atencion" : "ok",
      detalle: t("oficina.conexiones.correoDetalle", { n: b.correo_equipo.conectadas, e: b.correo_equipo.con_error, s: b.correo_equipo.sin_sincronizar }),
      accion: b.correo_equipo.con_error ? t("oficina.conexiones.accion.correo") : undefined,
    }, "correo_atascado"));
    const sinLlave = b.backstage.llaves === 0;
    const viejo = hacePasMasDe(b.backstage.ultimo_envio, 24, ahora);
    adentro.push({
      id: "backstage", nombre: t("oficina.conexiones.backstage"),
      estado: sinLlave ? "apagado" : viejo ? "atencion" : "ok",
      pastilla: sinLlave ? t("oficina.conexiones.estado.sinConfigurar") : !b.backstage.ultimo_envio ? t("oficina.conexiones.estado.sinDatos") : undefined,
      detalle: sinLlave ? t("oficina.conexiones.backstageSinLlave")
        : b.backstage.ultimo_envio ? t("oficina.conexiones.backstageUltimo", { f: fecha(b.backstage.ultimo_envio) }) : t("oficina.conexiones.backstageNunca"),
      accion: sinLlave ? t("oficina.conexiones.accion.backstageLlave") : viejo ? t("oficina.conexiones.accion.backstage") : undefined,
    });
    adentro.push({
      id: "llamadas", nombre: t("oficina.conexiones.llamadas"),
      estado: b.llamadas.cortes_1h >= 10 ? "atencion" : "ok",
      detalle: t("oficina.conexiones.llamadasDetalle", { c: b.llamadas.cortes_1h, m: b.llamadas.midiendo_1h }),
      accion: b.llamadas.cortes_1h >= 10 ? t("oficina.conexiones.accion.llamadas") : undefined,
    });
    const subidasMal = b.subidas.trabadas > 0 || b.subidas.fallo_24h > 0;
    adentro.push({
      id: "subidas", nombre: t("oficina.conexiones.subidas"),
      estado: subidasMal ? "atencion" : "ok",
      detalle: t("oficina.conexiones.subidasDetalle", { ok: b.subidas.ok_24h, f: b.subidas.fallo_24h, tr: b.subidas.trabadas }),
      accion: subidasMal ? t("oficina.conexiones.accion.subidas") : undefined,
    });
    if (b.nas || inc.has("nas_caido")) {
      const caido = !!b.nas?.caido;
      adentro.push(conIncidente({
        id: "nas-base", nombre: t("oficina.conexiones.nasCola"),
        estado: caido ? "mal" : (b.nas?.pendientes ?? 0) > 0 ? "atencion" : "ok",
        detalle: caido ? t("oficina.conexiones.nasCaido") : t("oficina.conexiones.nasCola2", { n: b.nas?.pendientes ?? 0 }),
        accion: caido ? t("oficina.conexiones.accion.nas") : (b.nas?.pendientes ?? 0) > 0 ? t("oficina.conexiones.accion.nasCola") : undefined,
      }, "nas_caido"));
    }
    if (b.hubstaff?.activo) {
      const tarde = hacePasMasDe(b.hubstaff.ultimo, 2, ahora);
      adentro.push({
        id: "hubstaff", nombre: "Hubstaff", estado: tarde ? "atencion" : "ok",
        detalle: b.hubstaff.ultimo ? t("oficina.conexiones.hubstaffUltimo", { f: fecha(b.hubstaff.ultimo) }) : t("oficina.conexiones.backstageNunca"),
        accion: tarde ? t("oficina.conexiones.accion.hubstaff") : undefined,
      });
    }
    // Los incidentes que no tienen su fila: cada uno en la suya.
    for (const i of inc.values()) {
      adentro.push({ id: `inc-${i.tipo}`, nombre: i.tipo, estado: "mal", detalle: <>{i.mensaje} · {t("oficina.conexiones.desde", { f: fecha(i.desde) })}</> });
    }
  }

  const todas = [...externos, ...adentro];
  const cuenta = (e: Semaforo) => todas.filter((f) => f.estado === e).length;
  const faltan = [
    vivo.isError ? t("oficina.conexiones.externos") : null,
    base.isError ? t("oficina.conexiones.adentro") : null,
  ].filter((x): x is string => !!x);
  const cargando = (vivo.isLoading || base.isLoading) && todas.length === 0;
  const resumen = peor(todas.map((f) => f.estado));
  const ocupado = vivo.isFetching || base.isFetching;
  const fichas: { e: Semaforo; k: TranslationKey }[] = [
    { e: "ok", k: "oficina.conexiones.resumen.ok" },
    { e: "atencion", k: "oficina.conexiones.resumen.atencion" },
    { e: "mal", k: "oficina.conexiones.resumen.mal" },
    { e: "apagado", k: "oficina.conexiones.resumen.apagado" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {!cargando && <Punto color={COLOR_ESTADO[faltan.length > 0 ? "mal" : resumen]} />}
          {cargando ? t("oficina.conexiones.probando")
            : faltan.length > 0 && resumen !== "mal" ? t("oficina.conexiones.noSePudoTodo")
            : t(resumen === "ok" ? "oficina.conexiones.todoBien" : resumen === "atencion" ? "oficina.conexiones.hayAtencion" : "oficina.conexiones.hayFallas")}
        </span>
        <span className="flex items-center gap-3">
          {vivo.data && <span className="text-xs text-muted-foreground">{t("oficina.conexiones.probadoA", { f: new Date(vivo.data.en).toLocaleTimeString(language, { hour: "numeric", minute: "2-digit" }) })}</span>}
          <Button variant="outline" size="sm" disabled={ocupado} onClick={() => probar.mutate()}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" /> : <RefreshCw className="h-4 w-4 sm:mr-1.5" />}
            <span className="hidden sm:inline">{t("oficina.conexiones.probar")}</span>
          </Button>
        </span>
      </div>

      <section aria-label={t("oficina.conexiones.resumen.titulo")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {fichas.map(({ e, k }) => (
          <div key={e} className="vidrio sube flex flex-col gap-2 p-4">
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Punto color={COLOR_ESTADO[e]} />{t(k)}</span>
            <span className="text-2xl font-semibold tabular-nums text-foreground">{cargando ? "—" : cuenta(e)}</span>
          </div>
        ))}
      </section>
      {faltan.length > 0 && <p className="-mt-2 text-[11px] text-muted-foreground">{t("oficina.conexiones.sinContar", { lista: faltan.join(", ") })}</p>}

      <Grupo titulo={t("oficina.conexiones.externos")} sub={t("oficina.conexiones.serviciosNota")} filas={externos}
        cargando={vivo.isLoading}
        fallos={[
          vivo.isError && <FalloCompacto key="vivo" texto={t("oficina.conexiones.falloExternos")} onReintentar={() => void vivo.refetch()} ocupado={vivo.isFetching} />,
          costos.isError && <FalloCompacto key="costos" onReintentar={() => void costos.refetch()} ocupado={costos.isFetching} />,
        ].filter(Boolean)} />
      <Grupo titulo={t("oficina.conexiones.adentro")} sub={t("oficina.conexiones.adentroNota")} filas={adentro}
        cargando={base.isLoading}
        fallos={base.isError ? [<FalloCompacto key="base" texto={t("oficina.conexiones.falloAdentro")} onReintentar={() => void base.refetch()} ocupado={base.isFetching} />] : []} />
    </div>
  );
}
