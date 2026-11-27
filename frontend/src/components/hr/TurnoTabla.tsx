import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, Bell, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Clock, DoorOpen, Loader2, RefreshCw, Search,
  UtensilsCrossed, Wifi, X,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/UserAvatar";
import { a12 } from "@/lib/horaBogota";
import { horaBogota } from "@/lib/llegadas";
import { hoyEnBogota } from "@/hooks/useHoyDelEquipo";
import { useTurnoTabla } from "@/hooks/useTurnoTabla";
import {
  minutosTrabajados, ordenarPorAtencion, seccionDe, semanaDe, sumarDias, turnosDelDia,
  type FilaTurno, type Motivo, type Nivel, type Seccion, type TipoFranja,
} from "@/lib/turnoTabla";

// LA TABLA DEL TURNO — la primera pestaña de Argos (Alvaro, 25/11/2026): «poder
// ver esto fácil, al grano, echar el chequeo de los empleados… el equivalente a
// tener un supervisor de personas». Arriba, a quién mirar y por qué; debajo una
// fila por persona con las mismas cinco cosas: llegada/salida, comida, baño,
// avisos de Argos y conexión. Tocar la fila abre su expediente EN ESE DÍA.
//
// Estilo: el de Argos, sin colores nuevos. La cifra va en blanco y el nivel en un
// puntito al lado, siempre con texto que dice lo mismo (el color nunca es la única
// señal). Lo que va bien no lleva puntito.

type Tr = (k: TranslationKey, vars?: Record<string, string | number>) => string;
// La vista de un toque (Alvaro, 27/11/2026: «filtrar los que estuvieron, los que no,
// los que estuvieron mejor, los que estuvieron peor»).
type Filtro = "todos" | "activos" | "trabajaron" | "noVinieron" | "mejores" | "peores" | "tarde" | "ignoro";
const VISTAS: Array<[Filtro, TranslationKey]> = [
  ["todos", "hr.turno.v.todos"], ["activos", "hr.turno.v.activos"], ["trabajaron", "hr.turno.v.trabajaron"], ["noVinieron", "hr.turno.v.noVinieron"],
  ["mejores", "hr.turno.v.mejores"], ["peores", "hr.turno.v.peores"],
];

const PUNTO: Record<Nivel | "ahora", string> = {
  ok: "",
  ambar: "bg-warning",
  rojo: "bg-destructive",
  ahora: "bg-primary",
};

const hora = (msx: number | null | undefined) => (msx == null ? "—" : horaBogota(new Date(msx).toISOString()));
const horaCorta = (msx: number) => hora(msx).replace(/\s?(AM|PM)$/i, "");

/** Minutos que le tocaba trabajar ese día (largo del turno). */
const minutosTurno = (f: FilaTurno) => (f.turnoInicio != null && f.turnoFin != null ? Math.round((f.turnoFin - f.turnoInicio) / 60_000) : null);

function duracion(t: Tr, minutos: number): string {
  if (minutos < 60) return t("hr.turno.min", { n: minutos });
  if (minutos % 60 === 0) return t("hr.turno.horasRedondas", { h: minutos / 60 });
  return t("hr.turno.horas", { h: Math.floor(minutos / 60), m: String(minutos % 60).padStart(2, "0") });
}

/** La frase de Argos para un motivo. */
function frase(t: Tr, m: Motivo): string {
  switch (m.k) {
    case "noVino": return t("hr.turno.motivo.noVino");
    case "noLlega": return t("hr.turno.motivo.noLlega", { d: duracion(t, m.min) });
    case "seFue": return t("hr.turno.motivo.seFue", { d: duracion(t, m.min) });
    case "ignoro": return t(m.n === 1 ? "hr.turno.motivo.ignoro1" : "hr.turno.motivo.ignoro", { n: m.n });
    case "tarde": return t("hr.turno.motivo.tarde", { d: duracion(t, m.min) });
    case "pocoActivo": return t("hr.turno.motivo.pocoActivo", { n: m.pct });
    case "comida": return t("hr.turno.motivo.comida", { n: m.min });
    case "bano": return t("hr.turno.motivo.bano", { n: m.min });
    case "avisos": return t("hr.turno.motivo.avisos", { n: m.n });
    case "cortes": return t("hr.turno.motivo.cortes", { n: m.n });
    case "sinMarca": return t("hr.turno.motivo.sinMarca");
    case "sinCierre": return t("hr.turno.motivo.sinCierre");
  }
}

function Punto({ nivel, etiqueta }: { nivel: Nivel | "ahora"; etiqueta?: string }) {
  if (nivel === "ok") return null;
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[nivel]}`} aria-label={etiqueta} role={etiqueta ? "img" : undefined} />;
}

/** Una celda: dato arriba (blanco) y detalle abajo (gris), con el puntito al lado del detalle. */
function Celda({ arriba, abajo, nivel = "ok", tenue = false, completo = false }: { arriba: string; abajo?: string; nivel?: Nivel | "ahora"; tenue?: boolean; completo?: boolean }) {
  // `completo` (el detalle abierto, 27/11/2026): el texto se parte en líneas, nunca se corta.
  const corte = completo ? "break-words" : "truncate";
  return (
    <div className="min-w-0">
      <p className={`${corte} ${completo ? "text-base font-semibold" : "text-sm"} tabular-nums ${tenue ? "text-muted-foreground" : "text-foreground"}`}>{arriba}</p>
      {abajo && (
        <p className={`mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground ${completo ? "" : "truncate"}`}>
          <span className="mt-1"><Punto nivel={nivel} /></span>
          <span className={corte}>{abajo}</span>
        </p>
      )}
    </div>
  );
}

/** UNA SOLA BARRA para todo Shift (Alvaro, 27/11/2026: «todas estas líneas tienen
 *  que tener la misma estética»): mismo alto, bordes, pista y colores. */
const PISTA = "relative h-2 overflow-hidden rounded-full bg-foreground/[0.06]";
const COLOR_FRANJA: Record<TipoFranja, string> = {
  // Un poco menos de brillo (Alvaro, 27/11/2026: «bájale un poquito el brillo»).
  trabajo: "bg-success/55",
  comida: "bg-[hsl(var(--chart-1)/0.65)]",
  bano: "bg-[hsl(var(--chart-5)/0.65)]",
  pausa: "bg-muted-foreground/20",
  sin_camara: "bg-warning/55",
  sin_pantalla: "bg-warning/55",
  corte: "bg-destructive/55",
};

/** El avance de hoy como indicador (27/11/2026): barrita de lo que lleva sobre lo
 *  que debería llevar y una pastilla de «X atrás» o «al día», más los problemas. */
function Avance({ lleva, deberia, falta, problemas, t }: { lleva: number; deberia: number; falta: number; problemas: number; t: Tr }) {
  const pct = deberia > 0 ? Math.min(100, (lleva / deberia) * 100) : 100;
  const atras = falta > 5;
  // Los MISMOS tonos de la franja de la izquierda (Alvaro, 27/11/2026: «tiene que ir
  // a la misma tonalidad»): verde de «Trabajando», ámbar de «Sin cámara o
  // pantalla» y rojo de «Sin internet», tomados de COLOR_FRANJA.
  const color = falta > 60 ? COLOR_FRANJA.corte : atras ? COLOR_FRANJA.sin_camara : COLOR_FRANJA.trabajo;
  // Misma forma que la franja del centro (Alvaro, 27/11/2026: «a la misma altura»):
  // la barra arriba, a la par de la franja, y debajo una sola línea con los datos.
  return (
    <div className="w-full">
      <div className={PISTA}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 text-[10px] tabular-nums">
        <span className="whitespace-nowrap text-foreground/80">{t("hr.turno.llevaDe", { a: duracion(t, lleva), b: duracion(t, deberia) })}</span>
        <span className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${color}`} aria-hidden />
          {atras ? t("hr.turno.atras", { d: duracion(t, falta) }) : t("hr.turno.alDia")}
          {problemas > 0 && <span className="text-muted-foreground/70">· {t(problemas === 1 ? "hr.turno.problema1" : "hr.turno.problemas", { n: problemas })}</span>}
        </span>
      </div>
    </div>
  );
}

// ── Lo que dice cada celda ────────────────────────────────────────────────────

function celdaLlegada(t: Tr, f: FilaTurno): { arriba: string; abajo: string; nivel: Nivel | "ahora"; tenue: boolean } {
  if (f.empiezaLuego) return { arriba: t("hr.turno.empieza", { h: a12(f.entrada) ?? "" }), abajo: "", nivel: "ok", tenue: true };
  if (f.noVino) return { arriba: t("hr.turno.noVino"), abajo: t("hr.turno.debia", { h: a12(f.entrada) ?? "" }), nivel: "rojo", tenue: false };
  if (f.llegada == null && f.noLlegaMin != null) {
    return { arriba: t("hr.turno.noLlega"), abajo: t("hr.turno.haceMin", { d: duracion(t, f.noLlegaMin) }), nivel: f.nivelLlegada, tenue: false };
  }
  if (f.llegada == null) return { arriba: "—", abajo: "", nivel: "ok", tenue: true };
  const arriba = hora(f.llegada);
  let abajo: string;
  let nivel: Nivel | "ahora" = "ok";
  if (f.antesMin != null && f.salidaAt != null) {
    abajo = t("hr.turno.seFueAntes", { h: hora(f.salidaAt), d: duracion(t, f.antesMin) });
    nivel = f.nivelLlegada;
  } else if (f.enCurso) {
    abajo = f.tardeMin != null ? t("hr.turno.tardeEnTurno", { d: duracion(t, f.tardeMin) }) : t("hr.turno.enTurno");
    nivel = f.tardeMin != null ? f.nivelLlegada : "ok";
  } else if (f.salidaAt != null) {
    const cierre = f.cierre === "sistema" ? t("hr.turno.cerroSistema") : f.cierre === "olvido" ? t("hr.turno.olvidoCerrar") : "";
    abajo = [f.tardeMin != null ? t("hr.turno.tardeMin", { d: duracion(t, f.tardeMin) }) : null, t("hr.turno.salio", { h: hora(f.salidaAt) }), cierre || null]
      .filter(Boolean).join(" · ");
    nivel = f.nivelLlegada;
  } else {
    abajo = f.tardeMin != null ? t("hr.turno.tardeMin", { d: duracion(t, f.tardeMin) }) : "";
    nivel = f.nivelLlegada;
  }
  if (f.sinMarca) abajo = [abajo, t("hr.turno.soloMarca")].filter(Boolean).join(" · ");
  return { arriba, abajo, nivel, tenue: false };
}

function celdaComida(t: Tr, f: FilaTurno): { arriba: string; abajo: string; nivel: Nivel | "ahora"; tenue: boolean } {
  const tope = t("hr.turno.deTope", { a: duracion(t, f.comidaMin), b: duracion(t, f.comidaTope) });
  if (f.comidaAhora != null) {
    return { arriba: t("hr.turno.fueraDesde", { h: hora(f.comidaAhora) }), abajo: tope, nivel: f.nivelComida === "ok" ? "ahora" : f.nivelComida, tenue: false };
  }
  if (!f.comida.length) {
    if (f.empiezaLuego) return { arriba: "", abajo: "", nivel: "ok", tenue: true };
    if (f.comidaTope === 0) return { arriba: t("hr.turno.sinPlanComida"), abajo: "", nivel: "ok", tenue: true };
    return { arriba: f.enCurso ? t("hr.turno.aunNo") : t("hr.turno.sinRegistro"), abajo: "", nivel: "ok", tenue: true };
  }
  const rangos = f.comida.map((c) => `${horaCorta(c.inicio)}–${c.fin != null ? hora(c.fin) : "…"}`);
  const arriba = rangos.length <= 2 ? rangos.join(", ") : `${horaCorta(f.comida[0].inicio)} … ${hora(f.comida[f.comida.length - 1].fin ?? f.comida[f.comida.length - 1].inicio)}`;
  const abajo = rangos.length > 2 ? `${t("hr.turno.salidas", { n: rangos.length })} · ${tope}` : tope;
  return { arriba, abajo, nivel: f.nivelComida, tenue: false };
}

function celdaBano(t: Tr, f: FilaTurno): { arriba: string; abajo: string; nivel: Nivel | "ahora"; tenue: boolean } {
  if (f.empiezaLuego) return { arriba: "", abajo: "", nivel: "ok", tenue: true };
  if (f.banoAhora != null) return { arriba: t("hr.turno.enBano"), abajo: t("hr.turno.deTope", { a: duracion(t, f.banoMin), b: duracion(t, f.banoTope) }), nivel: f.nivelBano === "ok" ? "ahora" : f.nivelBano, tenue: false };
  if (!f.banos) return { arriba: "0", abajo: "", nivel: "ok", tenue: true };
  return {
    arriba: t(f.banos === 1 ? "hr.turno.idas1" : "hr.turno.idas", { n: f.banos }),
    abajo: t("hr.turno.deTope", { a: duracion(t, f.banoMin), b: duracion(t, f.banoTope) }),
    nivel: f.nivelBano,
    tenue: false,
  };
}

function celdaAvisos(t: Tr, f: FilaTurno): { arriba: string; abajo: string; nivel: Nivel | "ahora"; tenue: boolean } {
  if (f.empiezaLuego) return { arriba: "", abajo: "", nivel: "ok", tenue: true };
  if (f.avisoAbierto) {
    return { arriba: String(f.avisos), abajo: t("hr.turno.avisandoAhora", { que: t(tipoAviso(f.avisoAbierto)) }), nivel: f.nivelAvisos === "ok" ? "ahora" : f.nivelAvisos, tenue: false };
  }
  if (!f.avisos) return { arriba: "0", abajo: "", nivel: "ok", tenue: true };
  const abajo = f.ignorados > 0
    ? t("hr.turno.ignorados", { n: f.ignorados })
    : f.corregidos === f.avisos ? t("hr.turno.corrigioTodos") : resumenTipos(t, f.avisosPorTipo);
  return { arriba: String(f.avisos), abajo, nivel: f.nivelAvisos, tenue: false };
}

function tipoAviso(tipo: string): TranslationKey {
  return tipo === "camara_apagada" ? "hr.turno.aviso.camara" : tipo === "sin_pantalla" ? "hr.turno.aviso.pantalla" : tipo === "fuera_cuadro" ? "hr.turno.aviso.cuadro" : "hr.turno.aviso.otro";
}

function resumenTipos(t: Tr, tipos: Record<string, number>): string {
  return Object.entries(tipos).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${t(tipoAviso(k))} ${n}`).join(" · ");
}

function celdaConexion(t: Tr, f: FilaTurno): { arriba: string; abajo: string; nivel: Nivel | "ahora"; tenue: boolean } {
  if (f.empiezaLuego || (f.conectadoMin === 0 && f.cortes === 0)) return { arriba: f.empiezaLuego ? "" : "—", abajo: "", nivel: "ok", tenue: true };
  const arriba = f.enCurso ? t("hr.turno.hastaAhora", { d: duracion(t, f.conectadoMin) }) : duracion(t, f.conectadoMin);
  const activo = f.conectadoMin > 0 ? Math.round((f.activoMin / f.conectadoMin) * 100) : 0;
  const partes = [t("hr.turno.activo", { n: activo })];
  partes.push(f.cortes ? t(f.cortes === 1 ? "hr.turno.corte1" : "hr.turno.cortes", { n: f.cortes, m: f.cortesMin }) : t("hr.turno.sinCortes"));
  return { arriba, abajo: partes.join(" · "), nivel: f.nivelConexion, tenue: false };
}

// ── La pantalla ───────────────────────────────────────────────────────────────

// ── La franja del día (27/11/2026) ───────────────────────────────────────────
// Los colores son los de Maven: trabajo en gris claro, comida y baño en el color
// principal, sin cámara o pantalla en ámbar y los cortes de internet en rojo.
const ORDEN_LEYENDA: Array<[TipoFranja, TranslationKey]> = [
  ["trabajo", "hr.turno.franja.trabajo"], ["comida", "hr.turno.franja.comida"], ["bano", "hr.turno.franja.bano"],
  ["sin_camara", "hr.turno.franja.sinCamara"], ["corte", "hr.turno.franja.corte"],
];

function Franja({ f, t, ahora }: { f: FilaTurno; t: Tr; ahora: number }) {
  const tramos = f.franja;
  if (!tramos.length && f.turnoInicio == null) return null;
  const desde = Math.min(f.turnoInicio ?? Infinity, ...tramos.map((x) => x.inicio));
  const hasta = Math.max(f.turnoFin ?? -Infinity, ...tramos.map((x) => x.fin));
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) return null;
  const pos = (ms: number) => `${((ms - desde) / (hasta - desde)) * 100}%`;
  const ancho = (a: number, b: number) => `${Math.max(0.3, ((b - a) / (hasta - desde)) * 100)}%`;
  // Primero el trabajo y los estados; encima, las pausas (comida y baño).
  const capas = [...tramos.filter((x) => x.tipo !== "comida" && x.tipo !== "bano"), ...tramos.filter((x) => x.tipo === "comida" || x.tipo === "bano")];
  return (
    <div aria-hidden>
      <div className={PISTA}>
        {f.turnoInicio != null && f.turnoFin != null && (
          <div className="absolute inset-y-0 rounded-full border border-border/60" style={{ left: pos(f.turnoInicio), width: ancho(f.turnoInicio, f.turnoFin) }} />
        )}
        {capas.map((x, i) => (
          <div key={i} className={`absolute inset-y-0 ${COLOR_FRANJA[x.tipo]}`} style={{ left: pos(x.inicio), width: ancho(x.inicio, x.fin) }} />
        ))}
        {f.marcasAviso.map((at, i) => (
          <div key={`a${i}`} className="absolute inset-y-0 w-0.5 bg-destructive" style={{ left: pos(at) }} />
        ))}
        {/* Lo que falta del turno, más tenue, y la marca de «ahora» (27/11/2026). */}
        {f.enCurso && ahora < hasta && (
          <>
            <div className="absolute inset-y-0 right-0 bg-background/40" style={{ left: pos(ahora) }} />
            <div className="absolute -inset-y-0.5 w-0.5 rounded-full bg-foreground" style={{ left: pos(ahora) }} />
          </>
        )}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-muted-foreground/70">
        <span>{hora(desde)}</span>
        <span>{f.marcasAviso.length ? t("hr.turno.franja.avisos", { n: f.marcasAviso.length }) : ""}</span>
        <span>{hora(hasta)}</span>
      </div>
    </div>
  );
}

const TITULO_SECCION: Record<Seccion, TranslationKey> = {
  mirar: "hr.turno.sec.mirar",
  ojo: "hr.turno.sec.ojo",
  bien: "hr.turno.sec.bien",
  luego: "hr.turno.sec.luego",
  inactivos: "hr.turno.sec.inactivos",
  noVinieron: "hr.turno.sec.noVinieron",
  libres: "hr.turno.sec.libres",
};

export function TurnoTabla() {
  const { t, language } = useLanguage();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const hoy = hoyEnBogota();
  const diaURL = params.get("dia");
  const dia = diaURL && /^\d{4}-\d{2}-\d{2}$/.test(diaURL) && diaURL <= hoy ? diaURL : hoy;
  const esHoy = dia === hoy;
  const irA = (d: string) => setParams((prev) => { const n = new URLSearchParams(prev); n.set("t", "turno"); if (d === hoy) n.delete("dia"); else n.set("dia", d); return n; }, { replace: true });

  const q = useTurnoTabla(dia, esHoy);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [guardandoLibre, setGuardandoLibre] = useState<string | null>(null);
  // DÍA LIBRE (27/11/2026): marcarlo o quitarlo desde la fila. Solo deja quien ya
  // puede editar el horario de esa persona (lo decide la base).
  const cambiarLibre = async (f: FilaTurno, libre: boolean) => {
    setGuardandoLibre(f.userId);
    const tabla = (supabase as unknown as { from: (x: string) => any }).from("argos_dia_libre"); // eslint-disable-line @typescript-eslint/no-explicit-any
    const { error } = libre
      ? await tabla.insert({ user_id: f.userId, dia })
      : await tabla.delete().eq("user_id", f.userId).eq("dia", dia);
    setGuardandoLibre(null);
    if (error) {
      toast({ title: t("hr.turno.libre.fallo"), description: error.message, variant: "destructive" });
      return;
    }
    void qc.invalidateQueries({ queryKey: ["argos-turno-tabla", dia] });
  };
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [turno, setTurno] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [calAbierto, setCalAbierto] = useState(false);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  const locale = language === "es" ? "es-CO" : language;
  const fmtDia = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00-05:00`).toLocaleDateString(locale, { timeZone: "America/Bogota", ...o });

  const filas = useMemo(() => q.data?.filas ?? [], [q.data]);
  const turnos = useMemo(() => turnosDelDia(filas), [filas]);
  const delTurno = useMemo(() => filas.filter((f) => !turno || `${f.entrada}–${f.salida}` === turno), [filas, turno]);
  const pasa = (f: FilaTurno, k: Filtro) =>
    k === "todos" ? true
      : k === "activos" ? f.activoAhora
      : k === "trabajaron" || k === "mejores" || k === "peores" ? f.llegada != null
        : k === "noVinieron" ? (f.noVino && !f.inactivo && !f.diaLibre) || f.noLlegaMin != null
          : k === "tarde" ? f.tardeMin != null
            : f.ignorados > 0;
  /** Qué parte de su turno trabajó (0–1), o null si no hay turno. */
  const parte = (f: FilaTurno) => { const m = minutosTurno(f); return m ? minutosTrabajados(f) / m : null; };
  /** Cómo va hoy (Alvaro, 27/11/2026: «debería llevar 2 y solo lleva 1 h 46»): lo que
   *  ya pasó del turno sin contar su comida y baño permitidos, lo que lleva de verdad,
   *  cuánto va atrás y cuántos problemas tuvo. */
  const marcha = (f: FilaTurno) => {
    if (f.turnoInicio == null || !q.data) return null;
    const pasados = Math.max(0, Math.round((Math.min(q.data.calculadoAt, f.turnoFin ?? q.data.calculadoAt) - f.turnoInicio) / 60_000));
    const deberia = Math.max(0, pasados - Math.min(f.comidaMin, f.comidaTope) - Math.min(f.banoMin, f.banoTope));
    const lleva = minutosTrabajados(f);
    // Problemas (Alvaro, 27/11/2026, las cuatro): avisos de Argos, cortes de internet,
    // ratos de 1 min o más sin cámara o sin pantalla, y pasarse del baño o la comida.
    const sinCamPant = f.franja.filter((x) => (x.tipo === "sin_camara" || x.tipo === "sin_pantalla") && x.fin - x.inicio >= 60_000).length;
    const pasado = (f.nivelComida !== "ok" ? 1 : 0) + (f.nivelBano !== "ok" ? 1 : 0);
    return { deberia, lleva, falta: Math.max(0, deberia - lleva), problemas: f.avisos + f.cortes + sinCamPant + pasado };
  };
  const texto = buscar.trim().toLocaleLowerCase();
  const vistas = useMemo(
    () => {
      const xs = delTurno.filter((f) => pasa(f, filtro) && (!texto || f.nombre.toLocaleLowerCase().includes(texto)));
      if (filtro === "mejores" || filtro === "peores") {
        const signo = filtro === "mejores" ? -1 : 1;
        return [...xs].sort((a, b) => signo * ((parte(a) ?? 0) - (parte(b) ?? 0)));
      }
      return ordenarPorAtencion(xs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [delTurno, filtro, texto],
  );
  const secciones = useMemo(() => {
    const m: Record<Seccion, FilaTurno[]> = { mirar: [], ojo: [], bien: [], luego: [], inactivos: [], libres: [], noVinieron: [] };
    for (const f of vistas) m[seccionDe(f)].push(f);
    return m;
  }, [vistas]);
  // LOS NÚMEROS DEL DÍA (Alvaro, 27/11/2026: «solo números»).
  const tocaban = delTurno.filter((f) => f.turnoInicio != null && !f.empiezaLuego && !f.inactivo && !f.diaLibre);
  const numeros = {
    vinieron: tocaban.filter((f) => f.llegada != null).length,
    tocaban: tocaban.length,
    tarde: delTurno.filter((f) => f.tardeMin != null).length,
    noVino: delTurno.filter((f) => f.noVino && !f.inactivo && !f.diaLibre).length,
    ignoraron: delTurno.filter((f) => f.ignorados > 0).length,
    // Trabajado = con cámara y pantalla, más hasta su gracia sin cámara o pantalla
    // (Alvaro, 27/11/2026: «10 minutos… después de ahí se descuenta»).
    horas: delTurno.reduce((s, f) => s + minutosTrabajados(f), 0),
    horasTurno: tocaban.reduce((s, f) => s + (minutosTurno(f) ?? 0), 0),
  };
  /** Frases contra lo normal de la persona. */
  const contraLoNormal = (f: FilaTurno): string[] => {
    const c = f.costumbre;
    if (!c) return [];
    const out: string[] = [];
    if (f.tardeMin != null && c.tardesSemana >= 1) out.push(t("hr.turno.normal.tardeVez", { n: c.tardesSemana + 1 }));
    if (!f.enCurso && f.llegada != null && c.conectadoPromedio != null && c.conectadoPromedio - f.conectadoMin >= 90) {
      out.push(t("hr.turno.normal.menos", { d: duracion(t, c.conectadoPromedio - f.conectadoMin) }));
    }
    return out;
  };

  const abrir = (f: FilaTurno) =>
    navegar(`/hr/expediente/${f.userId}?dia=${dia}`, { state: { volverA: `/hr/monitor-ia?t=turno${esHoy ? "" : `&dia=${dia}`}` } });

  const semana = semanaDe(dia);


  // FILA SENCILLA (Alvaro, 27/11/2026: «muy tupida… más minimalista; voy tocando y
  // me voy enterando»): a la vista solo la persona, una frase, su llegada y la
  // franja del día. Al tocarla se abre el detalle de las cinco cosas.
  const Fila = ({ f }: { f: FilaTurno }) => {
    const abierta = abiertoId === f.userId;
    const foto = q.fotos[f.userId];
    const frases = [...(f.motivos[0] ? [frase(t, f.motivos[0])] : []), ...contraLoNormal(f)];
    const motivo = f.diaLibre ? t("hr.turno.libre.marcado") : frases.length ? frases.join(" · ") : null;
    const horario = f.entrada && f.salida ? `${a12(f.entrada)} – ${a12(f.salida)}` : t("hr.turno.sinHorario");
    const puedeLibre = q.data?.diaLibreListo && (f.noVino || f.diaLibre) && !f.inactivo;
    const ll = celdaLlegada(t, f);
    return (
      <div className={`flex flex-col rounded-2xl transition ${abierta ? "bg-foreground/[0.04]" : ""}`}>
        <button
          type="button"
          onClick={() => setAbiertoId(abierta ? null : f.userId)}
          aria-expanded={abierta}
          className="group grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 rounded-2xl px-3 py-3.5 text-left transition hover:bg-foreground/[0.04] md:grid-cols-[minmax(11rem,15rem)_1fr_15rem_1rem]"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative shrink-0">
              <UserAvatar name={f.nombre} src={foto?.foto} seed={foto?.seed} size="sm" />
              {f.nivel !== "ok" && !f.empiezaLuego && (
                <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${PUNTO[f.nivel]}`} aria-label={t(f.nivel === "rojo" ? "hr.turno.sec.mirar" : "hr.turno.sec.ojo")} role="img" />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{f.nombre}</p>
              <p className="truncate text-[11px] text-muted-foreground">{motivo ?? horario}</p>
            </div>
          </div>
          <div className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto">{f.llegada != null && <Franja f={f} t={t} ahora={q.data?.calculadoAt ?? Date.now()} />}</div>
          <div className="text-right md:row-start-auto">
            {f.llegada != null ? (
              <>
                {(filtro === "mejores" || filtro === "peores") && parte(f) != null ? (
                  <>
                    <p className="font-display text-lg font-bold tabular-nums leading-none">{Math.round(parte(f)! * 100)} %</p>
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                      {t("hr.turno.deSuTurno", { a: duracion(t, minutosTrabajados(f)), b: minutosTurno(f) != null ? duracion(t, minutosTurno(f)!) : "—" })}
                    </p>
                  </>
                ) : f.enCurso && marcha(f) ? (
                  <Avance {...marcha(f)!} t={t} />
                ) : (
                  <>
                    <p className="text-sm tabular-nums text-foreground/90">
                      {t("hr.turno.deHoras", { a: duracion(t, minutosTrabajados(f)), b: minutosTurno(f) != null ? duracion(t, minutosTurno(f)!) : "—" })}
                    </p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">{t("hr.turno.llego", { h: ll.arriba })}</p>
                  </>
                )}
              </>
            ) : f.noVino && f.entrada ? (
              <p className="text-[12px] text-muted-foreground">{t("hr.turno.debiaEntrar", { h: a12(f.entrada) ?? "" })}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{ll.arriba || "—"}</p>
            )}
          </div>
          <ChevronDown className={`hidden h-4 w-4 text-muted-foreground transition md:block ${abierta ? "rotate-180" : ""}`} />
        </button>
        {abierta && f.llegada == null && (
          <div className="flex flex-wrap items-center gap-3 px-3 pb-4 md:pl-14">
            <p className="text-sm text-muted-foreground">
              {f.diaLibre ? t("hr.turno.libre.marcado") : t("hr.turno.noVinoDetalle", { h: horario })}
            </p>
            {puedeLibre && (
              <Button size="sm" variant="outline" className="rounded-full" disabled={guardandoLibre === f.userId} onClick={() => void cambiarLibre(f, !f.diaLibre)}>
                {t(f.diaLibre ? "hr.turno.libre.quitar" : "hr.turno.libre.marcar")}
              </Button>
            )}
          </div>
        )}
        {abierta && f.llegada != null && (
          <div className="flex flex-col gap-4 px-3 pb-5 md:pl-14">
            {/* Lo principal arriba y en grande (27/11/2026): el % de su turno, una barra
                y tres datos cortos. Sin frases largas. */}
            {minutosTurno(f) != null && (
              <div className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/30 p-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="flex items-baseline gap-2 sm:w-44 sm:shrink-0">
                  <span className="font-display text-[2.5rem] font-bold tabular-nums leading-none tracking-tight">{Math.round((parte(f) ?? 0) * 100)}%</span>
                  <span className="text-sm leading-tight text-muted-foreground">{t("hr.turno.pctDeSuTurno")}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <div className={PISTA}>
                    <div className={`h-full rounded-full ${COLOR_FRANJA.trabajo}`} style={{ width: `${Math.min(100, (parte(f) ?? 0) * 100)}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded-full bg-foreground/[0.06] px-2.5 py-1 tabular-nums">{t("hr.turno.chip.trabajo", { a: duracion(t, minutosTrabajados(f)), b: duracion(t, minutosTurno(f)!) })}</span>
                    <span className="rounded-full bg-foreground/[0.06] px-2.5 py-1 tabular-nums">{t("hr.turno.chip.camara", { c: duracion(t, f.activoMin) })}</span>
                    <span className="rounded-full bg-foreground/[0.06] px-2.5 py-1 tabular-nums">{t("hr.turno.chip.gracia", { g: duracion(t, Math.min(f.sinCamPantMin, f.graciaMin ?? 10)) })}</span>
                    {f.enCurso && marcha(f) && marcha(f)!.falta > 5 && (
                      <span className="flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 py-1 font-medium tabular-nums"><span className={`h-1.5 w-1.5 rounded-full ${COLOR_FRANJA.sin_camara}`} aria-hidden />{t("hr.turno.atras", { d: duracion(t, marcha(f)!.falta) })}</span>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {([
                [Clock, t("hr.turno.col.llegada"), ll],
                [UtensilsCrossed, t("hr.turno.col.comida"), celdaComida(t, f)],
                [DoorOpen, t("hr.turno.col.bano"), celdaBano(t, f)],
                [Bell, t("hr.turno.col.avisos"), celdaAvisos(t, f)],
                [Wifi, t("hr.turno.col.conexion"), celdaConexion(t, f)],
              ] as Array<[typeof Clock, string, ReturnType<typeof celdaLlegada>]>).map(([Icono, etq, x]) => (
                <div key={etq} className="flex h-full min-w-0 flex-col rounded-2xl border border-border/40 bg-card/20 p-3.5">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Icono className="h-3.5 w-3.5" />{etq}
                  </p>
                  <Celda arriba={x.arriba || "—"} abajo={x.abajo} nivel={x.nivel} tenue={x.tenue} completo />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => abrir(f)}>
                {t("hr.turno.verDia")}<ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
              {puedeLibre && (
                <Button size="sm" variant="ghost" className="rounded-full" disabled={guardandoLibre === f.userId} onClick={() => void cambiarLibre(f, !f.diaLibre)}>
                  {t(f.diaLibre ? "hr.turno.libre.quitar" : "hr.turno.libre.marcar")}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont flex flex-col gap-4">
        {/* LA CABECERA, UNA SOLA PIEZA (Alvaro, 27/11/2026): título y fechas, los
            números del día y las vistas, dentro del mismo marco. */}
        <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/25">
        {/* ENCABEZADO (Alvaro, 27/11/2026: «que quede bien estético»): el título a la
            izquierda y las fechas en un solo bloque a la derecha (semana + calendario). */}
        <div className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-foreground/[0.04] text-foreground/75">
              <ClipboardList className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.turno.titulo")}</h2>
              <p className="text-xs capitalize text-muted-foreground">
                {esHoy ? `${t("hr.turno.hoy")} · ` : ""}{fmtDia(dia, { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
          </div>

          <div className="flex w-full items-center gap-0.5 rounded-2xl border border-border/50 bg-background/40 p-1 xl:w-auto">
            <button type="button" onClick={() => irA(sumarDias(dia, -7))} aria-label={t("hr.turno.semanaAnterior")}
              className="flex h-11 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {semana.map((d) => {
              const futuro = d > hoy;
              const activo = d === dia;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={futuro}
                  onClick={() => irA(d)}
                  aria-current={activo ? "date" : undefined}
                  className={`relative flex h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-xl text-xs transition xl:w-12 xl:flex-none ${activo ? "bg-primary text-primary-foreground shadow-sm" : futuro ? "text-muted-foreground/35" : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"}`}
                >
                  <span className="capitalize leading-none">{fmtDia(d, { weekday: "short" }).replace(".", "")}</span>
                  <span className="mt-1 text-sm font-semibold tabular-nums leading-none">{fmtDia(d, { day: "numeric" })}</span>
                  {d === hoy && !activo && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" aria-label={t("hr.turno.hoy")} />}
                </button>
              );
            })}
            <button type="button" disabled={sumarDias(semana[0], 7) > hoy} onClick={() => irA(sumarDias(dia, 7) > hoy ? hoy : sumarDias(dia, 7))} aria-label={t("hr.turno.semanaSiguiente")}
              className="flex h-11 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:enabled:bg-foreground/[0.06] hover:enabled:text-foreground disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="mx-1 h-7 w-px shrink-0 bg-border/60" aria-hidden />
            <Popover open={calAbierto} onOpenChange={setCalAbierto}>
              <PopoverTrigger asChild>
                <button type="button" aria-label={t("hr.turno.elegirDia")} title={t("hr.turno.elegirDia")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground">
                  <CalendarDays className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={new Date(`${dia}T12:00:00`)}
                  disabled={(d) => d > new Date(`${hoy}T23:59:59`)}
                  onSelect={(d) => {
                    if (!d) return;
                    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    irA(s);
                    setCalAbierto(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {!esHoy && (
              <button type="button" onClick={() => irA(hoy)}
                className="h-11 shrink-0 rounded-xl px-3 text-xs font-medium text-primary transition hover:bg-foreground/[0.06]">
                {t("hr.turno.hoy")}
              </button>
            )}
          </div>
        </div>

          {!q.isLoading && !q.isError && filas.length > 0 && (
            <>
            {/* LOS NÚMEROS DEL DÍA: cada tarjeta filtra la tabla. */}
            <div className="grid grid-cols-2 border-t border-border/40 sm:grid-cols-5 sm:divide-x sm:divide-border/40">
              {([
                ["trabajaron", `${numeros.vinieron}/${numeros.tocaban}`, "hr.turno.num.vinieron", null],
                ["tarde", String(numeros.tarde), "hr.turno.num.tarde", numeros.tarde ? "ambar" : null],
                ["noVinieron", String(numeros.noVino), "hr.turno.num.noVino", numeros.noVino ? "rojo" : null],
                ["ignoro", String(numeros.ignoraron), "hr.turno.num.ignoraron", numeros.ignoraron ? "rojo" : null],
                // Números humanos (Alvaro, 27/11/2026: «no me hables por 216 h 01»): el % en grande y horas redondas abajo.
                [null, numeros.horasTurno ? `${Math.round((numeros.horas / numeros.horasTurno) * 100)} %` : "—", "hr.turno.num.horas", null],
              ] as Array<[Filtro | null, string, TranslationKey, Nivel | null]>).map(([k, valor, etq, nivel]) => (
                <button
                  key={etq}
                  type="button"
                  disabled={!k}
                  onClick={() => k && setFiltro(filtro === k ? "todos" : k)}
                  aria-pressed={k ? filtro === k : undefined}
                  className={`flex min-h-[5.5rem] flex-col justify-between px-4 py-3.5 text-left transition disabled:cursor-default ${k && filtro === k ? "bg-primary/10" : "hover:enabled:bg-foreground/[0.04]"}`}
                >
                  <p className="flex items-center gap-1.5 font-display text-2xl font-bold tabular-nums leading-none">
                    {valor}{nivel && <Punto nivel={nivel} />}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {etq === "hr.turno.num.horas"
                      ? t("hr.turno.num.horasDe", { a: Math.round(numeros.horas / 60), b: Math.round(numeros.horasTurno / 60) })
                      : t(etq)}
                  </p>
                </button>
              ))}
            </div>

            {/* VISTAS, TURNO Y BUSCADOR: todo del mismo alto (h-10) y sin barra de
                scroll; en ventanas angostas las vistas se reparten parejas. */}
            <div className="grid gap-2 border-t border-border/40 p-3 2xl:grid-cols-[minmax(0,1fr)_11rem_14rem] 2xl:items-center">
              <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border/50 bg-background/40 p-1 sm:flex">
                {VISTAS.filter(([k]) => k !== "activos" || esHoy).map(([k, etq]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFiltro(k)}
                    aria-pressed={filtro === k}
                    className={`h-8 min-w-0 truncate rounded-xl px-3 text-xs font-medium transition sm:flex-1 ${filtro === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"}`}
                  >
                    {t(etq)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 2xl:contents">
                <select
                  value={turno ?? ""}
                  onChange={(e) => setTurno(e.target.value || null)}
                  aria-label={t("hr.turno.turno")}
                  className="h-10 w-full min-w-0 rounded-2xl border border-border/50 bg-background/40 px-3 text-sm"
                >
                  <option value="">{t("hr.turno.todosTurnos")}</option>
                  {turnos.map((x) => {
                    const [e, s] = x.split("–");
                    return <option key={x} value={x}>{`${a12(e)} – ${a12(s)}`}</option>;
                  })}
                </select>
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    placeholder={t("hr.donde.buscar")}
                    aria-label={t("hr.donde.buscar")}
                    className="h-10 w-full rounded-2xl border border-border/50 bg-background/40 pl-9 pr-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {buscar && (
                    <button type="button" onClick={() => setBuscar("")} aria-label={t("hr.donde.verTodos")} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            </>
          )}
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : q.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1">{t("hr.turno.fallo")}</span>
            <Button variant="outline" size="sm" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.donde.reintentar")}</Button>
          </div>
        ) : !filas.length ? (
          <p className="rounded-2xl border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">{t("hr.turno.vacio")}</p>
        ) : (
          <>
            {/* LA TABLA */}
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-muted-foreground md:px-3">
                {ORDEN_LEYENDA.map(([k, etq]) => (
                  <span key={k} className="flex items-center gap-1"><span className={`inline-block h-2 w-3 rounded-sm ${COLOR_FRANJA[k]}`} />{t(etq)}</span>
                ))}
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-0.5 bg-destructive" />{t("hr.turno.franja.aviso")}</span>
              </div>
              {!vistas.length && (
                <p className="rounded-2xl border border-dashed border-border/50 p-5 text-center text-sm text-muted-foreground">{t("hr.turno.nadieAsi")}</p>
              )}
              {(filtro === "mejores" || filtro === "peores" || filtro === "noVinieron" || filtro === "activos") ? (
                <div className="mt-2 flex flex-col gap-1 md:divide-y md:divide-border/30">
                  {vistas.map((f) => <Fila key={f.userId} f={f} />)}
                </div>
              ) : (<>
              {(["mirar", "ojo", "bien"] as Seccion[]).map((s) => secciones[s].length > 0 && (
                <div key={s} className="flex flex-col gap-1.5 md:gap-0">
                  <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:px-3">
                    {s !== "bien" && <Punto nivel={s === "mirar" ? "rojo" : "ambar"} />}
                    {t(TITULO_SECCION[s])} · {secciones[s].length}
                  </p>
                  <div className="flex flex-col gap-1.5 md:divide-y md:divide-border/30 md:gap-0">
                    {secciones[s].map((f) => <Fila key={f.userId} f={f} />)}
                  </div>
                </div>
              ))}
              {secciones.noVinieron.length > 0 && (
                <details className="mt-2 rounded-2xl border border-dashed border-border/40 bg-card/10 p-3">
                  <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(TITULO_SECCION.noVinieron)} · {secciones.noVinieron.length}
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5 md:gap-0 md:divide-y md:divide-border/30">
                    {secciones.noVinieron.map((f) => <Fila key={f.userId} f={f} />)}
                  </div>
                </details>
              )}
              {secciones.luego.length > 0 && (
                <details className="mt-2 rounded-2xl border border-dashed border-border/40 bg-card/10 p-3">
                  <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(TITULO_SECCION.luego)} · {secciones.luego.length}
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5 md:gap-0 md:divide-y md:divide-border/30">
                    {secciones.luego.map((f) => <Fila key={f.userId} f={f} />)}
                  </div>
                </details>
              )}
              {secciones.inactivos.length > 0 && (
                <details className="mt-2 rounded-2xl border border-dashed border-border/40 bg-card/10 p-3">
                  <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(TITULO_SECCION.inactivos)} · {secciones.inactivos.length}
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5 md:gap-0 md:divide-y md:divide-border/30">
                    {secciones.inactivos.map((f) => <Fila key={f.userId} f={f} />)}
                  </div>
                </details>
              )}
              {secciones.libres.length > 0 && (
                <details className="mt-2 rounded-2xl border border-dashed border-border/40 bg-card/10 p-3">
                  <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(TITULO_SECCION.libres)} · {secciones.libres.length}
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5 md:gap-0 md:divide-y md:divide-border/30">
                    {secciones.libres.map((f) => <Fila key={f.userId} f={f} />)}
                  </div>
                </details>
              )}
              </>)}
            </div>

            <p className="text-[11px] text-muted-foreground">
              {esHoy ? t("hr.turno.actualizado", { h: hora(q.data?.calculadoAt ?? Date.now()) }) : t("hr.turno.diaCerrado")}
              {" · "}{t("hr.turno.comoJuzga")}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
