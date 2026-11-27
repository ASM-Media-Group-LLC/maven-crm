import { useEffect, useMemo, useState } from "react";
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
  jornadaDe, JORNADAS, minutosTrabajados, ordenarPorAtencion, seccionDe, semanaDe, sumarDias,
  type Jornada,
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
/** No vino (turno terminado) o aún no llega (turno empezado). Sin contar cuentas
 *  sin uso ni a quien tiene el día libre: la tarjeta y la vista dicen lo mismo. */
const noHaVenido = (f: FilaTurno) => (f.noVino || (f.llegada == null && f.noLlegaMin != null)) && !f.inactivo && !f.diaLibre;

const VISTAS: Array<[Filtro, TranslationKey]> = [
  // Orden y vista de entrada (Alvaro, 27/11/2026): 1 Activos ahora, 2 Trabajaron, 3 Todos.
  ["activos", "hr.turno.v.activos"], ["trabajaron", "hr.turno.v.trabajaron"], ["todos", "hr.turno.v.todos"], ["noVinieron", "hr.turno.v.noVinieron"],
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

/** Color del avance de hoy: los mismos de la franja (verde al día, ámbar atrás, rojo más de 1 h). */
const colorAvance = (falta: number) => (falta > 60 ? COLOR_FRANJA.corte : falta > 5 ? COLOR_FRANJA.sin_camara : COLOR_FRANJA.trabajo);

/** Fila cerrada (Alvaro, 27/11/2026: «¿para qué 2 líneas afuera?»): solo texto junto a la
 *  franja del día; la barra de avance vive adentro, al abrir a la persona. */
function AvanceTexto({ lleva, deberia, falta, problemas, t }: { lleva: number; deberia: number; falta: number; problemas: number; t: Tr }) {
  return (
    <div className="text-right">
      <p className="whitespace-nowrap text-sm tabular-nums text-foreground/90">{t("hr.turno.deHorasSolo", { a: duracion(t, lleva), b: duracion(t, deberia) })}</p>
      <p className="mt-0.5 flex items-center justify-end gap-1.5 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${colorAvance(falta)}`} aria-hidden />
        {falta > 5 ? t("hr.turno.atras", { d: duracion(t, falta) }) : t("hr.turno.alDia")}
        {problemas > 0 && <span className="text-muted-foreground/70">· {t(problemas === 1 ? "hr.turno.problema1" : "hr.turno.problemas", { n: problemas })}</span>}
      </p>
    </div>
  );
}

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

const ETIQUETA_FRANJA: Record<TipoFranja, TranslationKey> = {
  trabajo: "hr.turno.franja.trabajo", comida: "hr.turno.franja.comida", bano: "hr.turno.franja.bano",
  pausa: "hr.turno.franja.pausa", sin_camara: "hr.turno.franja.sinCamara", sin_pantalla: "hr.turno.franja.sinCamara", corte: "hr.turno.franja.corte",
};

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
        {/* Al pasar el mouse, qué es cada pedazo y a qué hora (Alvaro, 27/11/2026). */}
        {capas.map((x, i) => (
          <div key={i} title={`${t(ETIQUETA_FRANJA[x.tipo])} · ${hora(x.inicio)} – ${hora(x.fin)} · ${duracion(t, Math.max(1, Math.round((x.fin - x.inicio) / 60_000)))}`}
            className={`absolute inset-y-0 ${COLOR_FRANJA[x.tipo]}`} style={{ left: pos(x.inicio), width: ancho(x.inicio, x.fin) }} />
        ))}
        {f.marcasAviso.map((at, i) => (
          <div key={`a${i}`} title={`${t("hr.turno.franja.aviso")} · ${hora(at)}`}
            className="absolute -inset-y-0.5 w-1 cursor-help rounded-full bg-destructive" style={{ left: pos(at) }} />
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
        <span>{f.marcasAviso.length ? t(f.marcasAviso.length === 1 ? "hr.turno.franja.aviso1" : "hr.turno.franja.avisos", { n: f.marcasAviso.length }) : ""}</span>
        <span>{hora(hasta)}</span>
      </div>
    </div>
  );
}

// ── LO QUE PASÓ, PEDAZO POR PEDAZO (Alvaro, 27/11/2026) ─────────────────────
// «Miro la raya… mi expectativa sería saber la parte azul qué pasó, la parte roja
// qué pasó». Al abrir a la persona: la misma raya y, debajo, una línea por cada
// pedazo de color, con su hora y cuánto duró. Pasar el mouse por una línea
// ilumina su pedazo en la raya, y al revés.
type TipoEvento = Exclude<TipoFranja, "trabajo" | "sin_pantalla"> | "aviso";
interface Evento { tipo: TipoEvento; inicio: number; fin: number }

const COLOR_EVENTO: Record<TipoEvento, string> = {
  comida: COLOR_FRANJA.comida, bano: COLOR_FRANJA.bano, pausa: "bg-muted-foreground/40",
  sin_camara: COLOR_FRANJA.sin_camara, corte: COLOR_FRANJA.corte, aviso: "bg-destructive",
};
const ETIQUETA_EVENTO: Record<TipoEvento, TranslationKey> = {
  comida: "hr.turno.franja.comida", bano: "hr.turno.franja.bano", pausa: "hr.turno.franja.pausa",
  sin_camara: "hr.turno.franja.sinCamara", corte: "hr.turno.franja.corte", aviso: "hr.turno.franja.aviso",
};

/** Los pedazos que no son trabajo, juntando los seguidos del mismo tipo (menos de
 *  1 min entre uno y otro). Sin cámara/pantalla y pausas de menos de 1 min no
 *  salen (la gracia los cubre); comida, baño y cortes salen siempre. */
export function eventosDelDia(f: FilaTurno): Evento[] {
  const piezas = f.franja
    .filter((x) => x.tipo !== "trabajo")
    .map((x) => ({ tipo: (x.tipo === "sin_pantalla" ? "sin_camara" : x.tipo) as TipoEvento, inicio: x.inicio, fin: x.fin }))
    .sort((a, b) => a.inicio - b.inicio);
  const juntos: Evento[] = [];
  for (const x of piezas) {
    const prev = [...juntos].reverse().find((y) => y.tipo === x.tipo);
    if (prev && x.inicio - prev.fin < 60_000) { prev.fin = Math.max(prev.fin, x.fin); continue; }
    juntos.push({ ...x });
  }
  // Cowork marca la «pausa» y además la comida o el baño: si la pausa cae sobre
  // una comida o un baño, es la misma cosa y no se repite.
  const salidas = juntos.filter((x) => x.tipo === "comida" || x.tipo === "bano");
  const repetida = (x: Evento) => x.tipo === "pausa" && salidas.some((y) => Math.min(x.fin, y.fin) - Math.max(x.inicio, y.inicio) >= (x.fin - x.inicio) / 2);
  const largos = juntos.filter((x) => !repetida(x) && (x.tipo === "comida" || x.tipo === "bano" || x.tipo === "corte" || x.fin - x.inicio >= 60_000));
  const avisos = f.marcasAviso.map((at): Evento => ({ tipo: "aviso", inicio: at, fin: at }));
  return [...largos, ...avisos].sort((a, b) => a.inicio - b.inicio);
}

export function LoQuePaso({ f, t, ahora }: { f: FilaTurno; t: Tr; ahora: number }) {
  const [foco, setFoco] = useState<number | null>(null);
  const eventos = useMemo(() => eventosDelDia(f), [f]);
  const tramos = f.franja;
  const desde = Math.min(f.turnoInicio ?? Infinity, ...tramos.map((x) => x.inicio));
  const hasta = Math.max(f.turnoFin ?? -Infinity, ...tramos.map((x) => x.fin));
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) return null;
  const pos = (msx: number) => `${((msx - desde) / (hasta - desde)) * 100}%`;
  const ancho = (a: number, b: number) => `${Math.max(0.6, ((b - a) / (hasta - desde)) * 100)}%`;
  const apagado = (i: number) => (foco != null && foco !== i ? "opacity-25" : "");
  const trabajo = tramos.filter((x) => x.tipo === "trabajo");
  return (
    <div className="px-4 py-4">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("hr.turno.paso.titulo")}</p>
      {/* La raya, más alta, con cada pedazo numerado por su línea de abajo. */}
      <div className="relative h-3 overflow-hidden rounded-full bg-foreground/[0.06]" onMouseLeave={() => setFoco(null)}>
        {trabajo.map((x, i) => (
          <div key={`t${i}`} className={`absolute inset-y-0 ${COLOR_FRANJA.trabajo} transition-opacity ${foco != null ? "opacity-25" : ""}`}
            style={{ left: pos(x.inicio), width: ancho(x.inicio, x.fin) }} />
        ))}
        {eventos.map((x, i) => (
          <div key={i} onMouseEnter={() => setFoco(i)}
            title={`${t(ETIQUETA_EVENTO[x.tipo])} · ${x.tipo === "aviso" ? hora(x.inicio) : `${horaCorta(x.inicio)} – ${hora(x.fin)}`}`}
            className={`absolute inset-y-0 cursor-help transition-opacity ${COLOR_EVENTO[x.tipo]} ${x.tipo === "aviso" ? "w-1 rounded-full" : ""} ${apagado(i)} ${foco === i ? "ring-2 ring-foreground/70" : ""}`}
            style={{ left: pos(x.inicio), ...(x.tipo === "aviso" ? {} : { width: ancho(x.inicio, x.fin) }) }} />
        ))}
        {f.enCurso && ahora < hasta && (
          <>
            <div className="absolute inset-y-0 right-0 bg-background/40" style={{ left: pos(ahora) }} />
            <div className="absolute inset-y-0 w-0.5 rounded-full bg-foreground" style={{ left: pos(ahora) }} />
          </>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground/70">
        <span>{hora(desde)}</span><span>{hora(hasta)}</span>
      </div>

      {eventos.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span className={`h-2.5 w-2.5 rounded-sm ${COLOR_FRANJA.trabajo}`} aria-hidden />{t("hr.turno.paso.nada")}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col" onMouseLeave={() => setFoco(null)}>
          {eventos.map((x, i) => {
            const min = Math.max(1, Math.round((x.fin - x.inicio) / 60_000));
            const abierto = f.enCurso && x.tipo !== "aviso" && ahora - x.fin < 90_000;
            return (
              <li key={i} onMouseEnter={() => setFoco(i)}
                className={`grid grid-cols-[0.75rem_7.5rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors ${foco === i ? "bg-foreground/[0.06]" : ""}`}>
                <span className={`h-2.5 w-2.5 rounded-sm ${COLOR_EVENTO[x.tipo]}`} aria-hidden />
                <span className="tabular-nums text-muted-foreground">{x.tipo === "aviso" ? hora(x.inicio) : `${horaCorta(x.inicio)} – ${hora(x.fin)}`}</span>
                <span className="font-medium">{t(ETIQUETA_EVENTO[x.tipo])}</span>
                <span className="tabular-nums text-muted-foreground">
                  {x.tipo === "aviso" ? "" : abierto ? t("hr.turno.paso.enCurso", { d: duracion(t, min) }) : duracion(t, min)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
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
  const [filtro, setFiltro] = useState<Filtro>(esHoy ? "activos" : "trabajaron");
  // «Activos ahora» solo existe hoy: en otro día se cae a «Trabajaron», y al volver a hoy, a «Activos ahora».
  useEffect(() => {
    setFiltro((f) => (!esHoy && f === "activos" ? "trabajaron" : f));
  }, [esHoy]);
  const [turno, setTurno] = useState<Jornada | null>(null);
  const [buscar, setBuscar] = useState("");
  const [calAbierto, setCalAbierto] = useState(false);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  const locale = language === "es" ? "es-CO" : language;
  const fmtDia = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00-05:00`).toLocaleDateString(locale, { timeZone: "America/Bogota", ...o });

  const filas = useMemo(() => q.data?.filas ?? [], [q.data]);
  const delTurno = useMemo(() => filas.filter((f) => !turno || jornadaDe(f.entrada) === turno), [filas, turno]);
  const pasa = (f: FilaTurno, k: Filtro) =>
    k === "todos" ? true
      : k === "activos" ? f.activoAhora
      : k === "trabajaron" || k === "mejores" || k === "peores" ? f.llegada != null
        : k === "noVinieron" ? noHaVenido(f)
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
    // El mismo número que la vista «No vinieron» (27/11/2026).
    noVino: delTurno.filter(noHaVenido).length,
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
  // Se llama como función (no como componente nuevo en cada render): así, al abrir una
  // fila, la lista no se vuelve a montar entera y la página no salta arriba (27/11/2026).
  const fila = (f: FilaTurno) => {
    const abierta = abiertoId === f.userId;
    const foto = q.fotos[f.userId];
    const frases = [...(f.motivos[0] ? [frase(t, f.motivos[0])] : []), ...contraLoNormal(f)];
    const motivo = f.diaLibre ? t("hr.turno.libre.marcado") : frases.length ? frases.join(" · ") : null;
    const horario = f.entrada && f.salida ? `${a12(f.entrada)} – ${a12(f.salida)}` : t("hr.turno.sinHorario");
    const puedeLibre = q.data?.diaLibreListo && (f.noVino || f.diaLibre) && !f.inactivo;
    const ll = celdaLlegada(t, f);
    return (
      <div key={f.userId} className={`flex flex-col rounded-2xl transition ${abierta ? "bg-foreground/[0.04]" : ""}`}>
        <button
          type="button"
          onClick={() => setAbiertoId(abierta ? null : f.userId)}
          aria-expanded={abierta}
          className="group grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 rounded-2xl px-3 py-3.5 text-left transition hover:bg-foreground/[0.04] md:grid-cols-[minmax(11rem,15rem)_1fr_10.5rem_1rem]"
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
          {/* UNA PASTILLA CLARA (Alvaro, 27/11/2026): lo importante y nada más; las horas
              exactas van adentro. */}
          <div className="flex justify-end md:row-start-auto">
            {(() => {
              const m = f.enCurso && f.llegada != null ? marcha(f) : null;
              const pct = parte(f);
              const [punto, texto] = (filtro === "mejores" || filtro === "peores") && pct != null
                ? [COLOR_FRANJA.trabajo, t("hr.turno.pill.pct", { n: Math.round(pct * 100) })]
                : m ? [colorAvance(m.falta), m.falta > 5 ? t("hr.turno.atras", { d: duracion(t, m.falta) }) : t("hr.turno.alDia")]
                : f.llegada != null ? [null, t("hr.turno.pill.trabajo", { a: duracion(t, minutosTrabajados(f)), b: minutosTurno(f) != null ? duracion(t, minutosTurno(f)!) : "—" })]
                : f.noVino && f.entrada ? [null, t("hr.turno.debiaEntrar", { h: a12(f.entrada) ?? "" })]
                : [null, ll.arriba || "—"];
              return (
                <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border/50 bg-foreground/[0.04] px-3 py-1.5 text-xs font-medium tabular-nums text-foreground/85">
                  {punto && <span className={`h-2 w-2 rounded-full ${punto}`} aria-hidden />}
                  {texto}
                </span>
              );
            })()}
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
          // LISTA SIMPLE (Alvaro, 27/11/2026): sin cajas, un renglón por dato.
          <div className="flex flex-col gap-4 px-3 pb-5 md:pl-14">
            <div className="divide-y divide-border/40 rounded-2xl border border-border/40 bg-card/30">
              {(() => {
                const m = f.enCurso ? marcha(f) : null;
                const pct = m ? (m.deberia > 0 ? Math.min(1, m.lleva / m.deberia) : 1) : Math.min(1, parte(f) ?? 0);
                return (
                  // VISUAL (Alvaro, 27/11/2026: «puro texto»): el % grande; la barra y, debajo,
                  // a sus lados, lo que lleva y lo que debería llevar; la pastilla aparte.
                  <div className="flex items-center gap-5 px-4 py-4">
                    <div className="w-24 shrink-0">
                      <p className="font-display text-4xl font-bold tabular-nums leading-none tracking-tight">{Math.round(pct * 100)}%</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{t(m ? "hr.turno.lista.avanceHoy" : "hr.turno.lista.turno")}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={PISTA}>
                        <div className={`h-full rounded-full ${m ? colorAvance(m.falta) : COLOR_FRANJA.trabajo}`} style={{ width: `${pct * 100}%` }} />
                      </div>
                      <div className="mt-2 flex items-start justify-between gap-3 text-xs tabular-nums">
                        <span><span className="block text-[11px] text-muted-foreground">{t("hr.turno.v2.lleva")}</span><span className="font-semibold">{duracion(t, m ? m.lleva : minutosTrabajados(f))}</span></span>
                        <span className="text-right"><span className="block text-[11px] text-muted-foreground">{t(m ? "hr.turno.v2.deberia" : "hr.turno.v2.turno")}</span><span className="font-semibold">{duracion(t, m ? m.deberia : (minutosTurno(f) ?? 0))}</span></span>
                      </div>
                    </div>
                    {m && (
                      <span className="hidden shrink-0 items-center gap-2 rounded-full border border-border/50 bg-foreground/[0.04] px-3 py-1.5 text-xs font-medium tabular-nums sm:inline-flex">
                        <span className={`h-2 w-2 rounded-full ${colorAvance(m.falta)}`} aria-hidden />
                        {m.falta > 5 ? t("hr.turno.atras", { d: duracion(t, m.falta) }) : t("hr.turno.alDia")}
                      </span>
                    )}
                  </div>
                );
              })()}
              <LoQuePaso f={f} t={t} ahora={q.data?.calculadoAt ?? Date.now()} />
              {([
                [Clock, t("hr.turno.col.llegada"), ll],
                [UtensilsCrossed, t("hr.turno.col.comida"), celdaComida(t, f)],
                [DoorOpen, t("hr.turno.col.bano"), celdaBano(t, f)],
                [Bell, t("hr.turno.col.avisos"), celdaAvisos(t, f)],
                [Wifi, t("hr.turno.col.conexion"), celdaConexion(t, f)],
              ] as Array<[typeof Clock, string, ReturnType<typeof celdaLlegada>]>).map(([Icono, etq, x]) => (
                <div key={etq} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="flex w-40 shrink-0 items-center gap-2 text-sm text-muted-foreground"><Icono className="h-4 w-4" />{etq}</span>
                  <span className={`text-sm font-medium tabular-nums ${x.tenue ? "text-muted-foreground" : "text-foreground"}`}>{x.arriba || "—"}</span>
                  {x.abajo && (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Punto nivel={x.nivel} />{x.abajo}
                    </span>
                  )}
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

          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center xl:w-auto">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 rounded-2xl border border-border/50 bg-background/40 p-1 xl:w-auto">
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
          {/* EL BUSCADOR, ARRIBA A LA DERECHA (Alvaro, 27/11/2026). */}
          <div className="relative w-full min-w-0 sm:w-44 sm:shrink-0 xl:w-52">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder={t("hr.turno.buscar")}
              aria-label={t("hr.donde.buscar")}
              className="h-[3.25rem] w-full rounded-2xl border border-border/50 bg-background/40 pl-9 pr-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {buscar && (
              <button type="button" onClick={() => setBuscar("")} aria-label={t("hr.donde.verTodos")} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
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
            <div className="grid gap-2 border-t border-border/40 p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border/50 bg-background/40 p-1 sm:flex">
                {VISTAS.map(([k, etq]) => (
                  <button
                    key={k}
                    type="button"
                    // «Activos ahora» siempre visible (Alvaro, 27/11/2026); mirando otro día, lleva a hoy.
                    onClick={() => { if (k === "activos" && !esHoy) irA(hoy); setFiltro(k); }}
                    aria-pressed={filtro === k}
                    className={`h-8 min-w-0 truncate whitespace-nowrap rounded-xl px-2.5 text-xs font-medium transition sm:flex-auto sm:overflow-visible ${filtro === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"}`}
                  >
                    {t(etq)}
                    {/* CUÁNTOS (Alvaro, 27/11/2026: «falta saber cuántos están activos en
                        este momento»): el número de cada vista al lado. Mejores y Peores
                        son un orden, no un grupo; y «Activos ahora» solo cuenta hoy. */}
                    {k !== "mejores" && k !== "peores" && (k !== "activos" || esHoy) && q.data && (
                      <span className={`ml-1.5 tabular-nums ${filtro === k ? "opacity-80" : "text-foreground/70"}`}>
                        {k === "activos" && <span className="mr-1 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-success" aria-hidden />}
                        {delTurno.filter((f) => pasa(f, k)).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {/* LA JORNADA (Alvaro, 27/11/2026): un botoncito, no la lista de horarios. */}
              <div className="flex shrink-0 gap-1 rounded-2xl border border-border/50 bg-background/40 p-1" role="group" aria-label={t("hr.turno.turno")}>
                {([null, ...JORNADAS] as Array<Jornada | null>).map((j) => (
                  <button key={j ?? "todas"} type="button" onClick={() => setTurno(j)} aria-pressed={turno === j}
                    className={`h-8 flex-1 whitespace-nowrap rounded-xl px-3 text-xs font-medium transition lg:flex-none ${turno === j ? "bg-foreground/[0.1] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"}`}>
                    {t(j === null ? "hr.turno.jornada.todas" : j === "am" ? "hr.turno.jornada.am" : j === "pm" ? "hr.turno.jornada.pm" : "hr.turno.jornada.madrugada")}
                  </button>
                ))}
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
                  {vistas.map(fila)}
                </div>
              ) : (<>
              {(["mirar", "ojo", "bien"] as Seccion[]).map((s) => secciones[s].length > 0 && (
                <div key={s} className="flex flex-col gap-1.5 md:gap-0">
                  <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:px-3">
                    {s !== "bien" && <Punto nivel={s === "mirar" ? "rojo" : "ambar"} />}
                    {t(TITULO_SECCION[s])} · {secciones[s].length}
                  </p>
                  <div className="flex flex-col gap-1.5 md:divide-y md:divide-border/30 md:gap-0">
                    {secciones[s].map(fila)}
                  </div>
                </div>
              ))}
              {secciones.noVinieron.length > 0 && (
                <details className="mt-2 rounded-2xl border border-dashed border-border/40 bg-card/10 p-3">
                  <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(TITULO_SECCION.noVinieron)} · {secciones.noVinieron.length}
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5 md:gap-0 md:divide-y md:divide-border/30">
                    {secciones.noVinieron.map(fila)}
                  </div>
                </details>
              )}
              {secciones.luego.length > 0 && (
                <details className="mt-2 rounded-2xl border border-dashed border-border/40 bg-card/10 p-3">
                  <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(TITULO_SECCION.luego)} · {secciones.luego.length}
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5 md:gap-0 md:divide-y md:divide-border/30">
                    {secciones.luego.map(fila)}
                  </div>
                </details>
              )}
              {secciones.inactivos.length > 0 && (
                <details className="mt-2 rounded-2xl border border-dashed border-border/40 bg-card/10 p-3">
                  <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(TITULO_SECCION.inactivos)} · {secciones.inactivos.length}
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5 md:gap-0 md:divide-y md:divide-border/30">
                    {secciones.inactivos.map(fila)}
                  </div>
                </details>
              )}
              {secciones.libres.length > 0 && (
                <details className="mt-2 rounded-2xl border border-dashed border-border/40 bg-card/10 p-3">
                  <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(TITULO_SECCION.libres)} · {secciones.libres.length}
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5 md:gap-0 md:divide-y md:divide-border/30">
                    {secciones.libres.map(fila)}
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
