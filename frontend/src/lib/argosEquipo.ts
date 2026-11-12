// ARGOS ORGANIZADO POR DEPARTAMENTO (Alvaro, 11/11/2026: «me pierdo»; «los
// departamentos solo muestran un número, 89»). Funciones puras que arman:
//
//   · EQUIPO HOY (en vivo): cuántos están conectados, van bien, van mal, llegaron
//     tarde y no están en Cowork; por departamento lo mismo, y quién va mal y POR
//     QUÉ, en minutos.
//   · EL DÍA (por fecha): por departamento, quién fue mal (nota < 60) y por qué en
//     minutos, quién fue bien y quién no vino.
//
// LA REGLA de «va mal» (Alvaro, 11/11): está en su turno y CUALQUIERA de estas:
//   · tiene una falla abierta ahora (1 min o más sin cámara, sin pantalla, fuera
//     de cuadro o sin conexión, o una alerta de Argos abierta: en otra cosa,
//     celular, no mira, fuera de lugar, pausa de más);
//   · su nota de hoy baja de 60 (en vivo: sobre lo que va de su turno; por fecha:
//     sobre el turno completo; la misma fórmula 45/35/20 de siempre);
//   · salió de Cowork en su turno;
//   · llegó tarde.
// La pausa dentro del tiempo NO es ir mal. Las ata test/argos/argosEquipo.test.ts.

import { calcularNota, fraccionJornada } from "@/lib/notaEmpleado";

export type Grupo = "mal" | "bien" | "noEsta" | "fueraDeTurno";

export type ClaveMotivo =
  | "sinCamara" | "sinPantalla" | "fueraDeCuadro" | "sinConexion" | "fueraCowork" | "noEntro"
  | "alerta" | "conectado" | "flojos" | "tarde" | "nota";

/** Un porqué, en minutos (o en cantidad para «flojos»). */
export interface Motivo {
  clave: ClaveMotivo;
  /** Minutos (o pantallazos, en «flojos»). */
  n: number;
  /** El tipo de la alerta de Argos (en «alerta»). */
  tipo?: string;
  /** Lo que dijo Argos (en «alerta»). */
  detalle?: string | null;
}

export interface PersonaEquipo {
  userId: string;
  nombre: string;
  equipo: string;
  grupo: Grupo;
  /** De peor a menos malo. */
  motivos: Motivo[];
  horas: number | null;
  pantallaPct: number | null;
  camaraPct: number | null;
  tardeMin: number | null;
  nota: number | null;
  /** Lo que tenía en pantalla según la última captura (en vivo). */
  pantallaQue: string | null;
  estado: string | null;
}

export interface Conteo {
  total: number;
  conectados: number;
  bien: number;
  mal: number;
  tarde: number;
  noEstan: number;
}

export interface Depto extends Conteo {
  nombre: string;
  personas: PersonaEquipo[];
}

export interface EquipoArmado {
  resumen: Conteo;
  deptos: Depto[];
}

// ─── Entradas (lo que ya leen los hooks) ────────────────────────────────────

export interface FilaDonde {
  user_id: string;
  nombre: string | null;
  equipo: string | null;
  entrada: string | null;
  salida?: string | null;
  exento?: boolean;
  en_turno: boolean;
  estado: string;
  estado_desde: string | null;
  pantalla_que: string | null;
}

export interface FilaTurno {
  userId: string;
  nombre: string;
  equipo: string;
  nota: { valor: number | null };
  pantallaPct: number | null;
  camaraPct: number | null;
  horasTurno: number;
  tardeMin: number | null;
  segActivo: number;
  segSinPantalla: number;
  segSinCamara: number;
  segFueraCamara: number;
  juzgadas: number;
  juzgadasOk: number;
}

export interface AlertaAbierta {
  user_id: string;
  tipo: string;
  abierta_at: string;
  detalle: string | null;
}

/** Alertas de Argos que cuentan como «va mal» (sin_senal es del rastreo, no de la persona). */
export const ALERTAS_QUE_CUENTAN = ["distraido", "celular", "no_mira", "fuera_de_lugar", "sin_pantalla", "pausa_de_mas"];
const FALLA_AHORA: Record<string, ClaveMotivo> = {
  sin_camara: "sinCamara", sin_pantalla: "sinPantalla", fuera_de_camara: "fueraDeCuadro", sin_conexion: "sinConexion",
};
const FUERA: ReadonlySet<string> = new Set(["fuera_de_cowork", "sin_conexion_larga"]);
const NOTA_MALA = 60;

/** La pausa libre (baño 10 + comida 30) que no cuenta en contra, como en la nota. */
const EXENTO_SEG = 40 * 60;

/** La nota de siempre (45/35/20) sobre `baseSeg` segundos de turno. null si no hay base. */
export function notaSobre(p: FilaTurno, baseSeg: number, exento = false): { nota: number | null; pantalla: number | null; camara: number | null } {
  if (baseSeg < 30 * 60) return { nota: null, pantalla: null, camara: null };
  const horas = baseSeg / 3600;
  const libre = Math.min(EXENTO_SEG, baseSeg * 0.1);
  const pantalla = exento ? undefined : fraccionJornada(p.segActivo + p.segSinCamara + p.segFueraCamara, horas, libre);
  const camara = exento ? undefined : fraccionJornada(p.segActivo + p.segSinPantalla, horas, libre);
  const atencion = p.juzgadas > 0 ? p.juzgadasOk / p.juzgadas : undefined;
  return {
    nota: calcularNota({ pantallaPct: pantalla, camaraPct: camara, atencionPct: atencion }).valor,
    pantalla: pantalla === undefined ? null : Math.round(pantalla * 100),
    camara: camara === undefined ? null : Math.round(camara * 100),
  };
}

/** Segundos de su turno de hoy que ya pasaron (Bogotá; cruza la medianoche). */
function turnoTranscurrido(entrada: string | null, salida: string | null | undefined, ahora: number): number {
  if (!entrada || !salida) return 0;
  const hoy = new Date(ahora - 5 * 3_600_000).toISOString().slice(0, 10);
  let ini = Date.parse(`${hoy}T${entrada.slice(0, 5)}:00-05:00`);
  let fin = Date.parse(`${hoy}T${salida.slice(0, 5)}:00-05:00`);
  if (fin <= ini) fin += 86_400_000;
  if (ahora < ini) { ini -= 86_400_000; fin -= 86_400_000; } // turno de anoche que sigue
  return Math.max(0, Math.min(ahora, fin) - ini) / 1000;
}

const minutosDesde = (iso: string | null, ahora: number) => (iso ? Math.max(0, Math.floor((ahora - Date.parse(iso)) / 60_000)) : 0);

/** Minutos desde la hora de entrada de hoy (Bogotá) — para «no ha entrado». */
function minutosDesdeEntrada(entrada: string | null, ahora: number): number {
  if (!entrada) return 0;
  const hoy = new Date(ahora - 5 * 3_600_000).toISOString().slice(0, 10);
  const ini = Date.parse(`${hoy}T${entrada.slice(0, 5)}:00-05:00`);
  return Number.isFinite(ini) ? Math.max(0, Math.floor((ahora - ini) / 60_000)) : 0;
}

function contar(personas: PersonaEquipo[], estaEnCowork: (p: PersonaEquipo) => boolean): Conteo {
  const enTurno = personas.filter((p) => p.grupo !== "fueraDeTurno");
  return {
    total: enTurno.length,
    conectados: enTurno.filter(estaEnCowork).length,
    bien: enTurno.filter((p) => p.grupo === "bien").length,
    mal: enTurno.filter((p) => p.grupo === "mal").length,
    tarde: enTurno.filter((p) => (p.tardeMin ?? 0) > 0).length,
    noEstan: enTurno.filter((p) => !estaEnCowork(p)).length,
  };
}

/** Peor departamento primero (más gente yendo mal), luego por nombre. */
function ordenarDeptos(d: Depto[]): Depto[] {
  return [...d].sort((a, b) => b.mal - a.mal || b.noEstan - a.noEstan || a.nombre.localeCompare(b.nombre, "es"));
}

/** Dentro de cada grupo: el que más tiempo lleva mal primero; los demás por nombre. */
function ordenarPersonas(p: PersonaEquipo[]): PersonaEquipo[] {
  // Lo que más pesa: los minutos que faltó de su turno («conectado X de Y») y lo
  // que le falta a la nota para 100; luego los minutos de cada falla.
  const pesoDe = (m: Motivo) => (m.clave === "flojos" ? m.n * 5 : m.clave === "conectado" ? Math.max(0, Number(m.detalle ?? 0) - m.n) : m.clave === "nota" ? 100 - m.n : m.n);
  const peso = (x: PersonaEquipo) => x.motivos.reduce((a, m) => a + pesoDe(m), 0);
  return [...p].sort((a, b) => (a.grupo === "mal" && b.grupo === "mal" ? peso(b) - peso(a) : 0) || a.nombre.localeCompare(b.nombre, "es"));
}

function agrupar(personas: PersonaEquipo[], estaEnCowork: (p: PersonaEquipo) => boolean): EquipoArmado {
  const porDepto = new Map<string, PersonaEquipo[]>();
  for (const p of personas) porDepto.set(p.equipo, [...(porDepto.get(p.equipo) ?? []), p]);
  const deptos = [...porDepto.entries()]
    .map(([nombre, gente]) => ({ nombre, personas: ordenarPersonas(gente), ...contar(gente, estaEnCowork) }))
    .filter((d) => d.total > 0);
  return { resumen: contar(personas, estaEnCowork), deptos: ordenarDeptos(deptos) };
}

/** EQUIPO HOY: el estado de cada uno AHORA, por departamento. */
export function armarEquipoHoy(donde: FilaDonde[], turno: FilaTurno[], alertas: AlertaAbierta[], ahora: number): EquipoArmado {
  const delDia = new Map(turno.map((p) => [p.userId, p]));
  const alertasDe = new Map<string, AlertaAbierta[]>();
  for (const a of alertas) {
    if (!ALERTAS_QUE_CUENTAN.includes(a.tipo)) continue;
    alertasDe.set(a.user_id, [...(alertasDe.get(a.user_id) ?? []), a]);
  }
  const personas = donde.map((f): PersonaEquipo => {
    const d = delDia.get(f.user_id);
    const vivo = d ? notaSobre(d, turnoTranscurrido(f.entrada, f.salida, ahora), f.exento === true) : { nota: null, pantalla: null, camara: null };
    const motivos: Motivo[] = [];
    let grupo: Grupo;
    if (!f.en_turno) {
      grupo = "fueraDeTurno";
    } else if (f.estado === "no_ha_entrado") {
      grupo = "noEsta";
      motivos.push({ clave: "noEntro", n: minutosDesdeEntrada(f.entrada, ahora) });
    } else {
      if (FUERA.has(f.estado)) motivos.push({ clave: "fueraCowork", n: minutosDesde(f.estado_desde, ahora) });
      const falla = FALLA_AHORA[f.estado];
      const minFalla = minutosDesde(f.estado_desde, ahora);
      if (falla && minFalla >= 1) motivos.push({ clave: falla, n: minFalla });
      for (const a of alertasDe.get(f.user_id) ?? []) {
        motivos.push({ clave: "alerta", n: minutosDesde(a.abierta_at, ahora), tipo: a.tipo, detalle: a.detalle });
      }
      motivos.sort((a, b) => b.n - a.n);
      if (vivo.nota !== null && vivo.nota < NOTA_MALA) motivos.push({ clave: "nota", n: vivo.nota });
      if ((d?.tardeMin ?? 0) > 0) motivos.push({ clave: "tarde", n: d!.tardeMin as number });
      grupo = motivos.length > 0 ? "mal" : "bien";
    }
    return {
      userId: f.user_id,
      nombre: (f.nombre ?? d?.nombre ?? "").trim(),
      equipo: f.equipo || d?.equipo || "Otros",
      grupo, motivos,
      horas: d ? d.horasTurno : null,
      pantallaPct: vivo.pantalla,
      camaraPct: vivo.camara,
      tardeMin: d?.tardeMin ?? null,
      // Quien no ha entrado no tiene nota de hoy todavía.
      nota: grupo === "noEsta" ? null : vivo.nota,
      pantallaQue: f.pantalla_que,
      estado: f.estado,
    };
  });
  const enCowork = (p: PersonaEquipo) => p.estado !== "no_ha_entrado" && !FUERA.has(p.estado ?? "");
  return agrupar(personas, enCowork);
}

/** El porqué de un día que fue mal, en minutos, de lo más grande a lo más chico. */
export function motivosDelDia(p: FilaTurno, jornadaHoras: number): Motivo[] {
  const m: Motivo[] = [];
  const conectadoMin = Math.round(p.horasTurno * 60);
  if (p.pantallaPct !== null && p.pantallaPct < 80) m.push({ clave: "conectado", n: conectadoMin, detalle: String(Math.round(jornadaHoras * 60)) });
  const sc = Math.round((p.segSinCamara + p.segFueraCamara) / 60);
  if (sc >= 1) m.push({ clave: "sinCamara", n: sc });
  const sp = Math.round(p.segSinPantalla / 60);
  if (sp >= 1) m.push({ clave: "sinPantalla", n: sp });
  const flojos = Math.max(0, p.juzgadas - p.juzgadasOk);
  if (flojos > 0) m.push({ clave: "flojos", n: flojos });
  if ((p.tardeMin ?? 0) > 0) m.push({ clave: "tarde", n: p.tardeMin as number });
  // «Conectado poco» va primero (es lo que más pesa); el resto por minutos.
  return m.sort((a, b) => (a.clave === "conectado" ? -1 : b.clave === "conectado" ? 1 : (b.clave === "flojos" ? b.n * 5 : b.n) - (a.clave === "flojos" ? a.n * 5 : a.n)));
}

export interface MiembroRoster { userId: string; nombre: string; equipo: string; /** Horas de su turno (para «conectado X de Y»). */ jornadaHoras?: number }

/** EL DÍA (por fecha): por departamento, quién fue mal (nota < 60), bien, y quién no vino. */
export function armarDeptosDelDia(personas: FilaTurno[], roster: MiembroRoster[], jornadaHoras: number): EquipoArmado {
  const vinieron = new Set(personas.map((p) => p.userId));
  const jornadaDe = new Map(roster.map((r) => [r.userId, r.jornadaHoras ?? jornadaHoras]));
  const conDatos = personas.map((p): PersonaEquipo => {
    const jornada = jornadaDe.get(p.userId) ?? jornadaHoras;
    const n = notaSobre(p, jornada * 3600);
    const mal = (n.nota !== null && n.nota < NOTA_MALA) || (p.tardeMin ?? 0) > 0;
    const motivos = mal ? motivosDelDia({ ...p, pantallaPct: n.pantalla }, jornada) : [];
    if (mal && n.nota !== null && n.nota < NOTA_MALA && !motivos.length) motivos.push({ clave: "nota", n: n.nota });
    return {
      userId: p.userId, nombre: p.nombre, equipo: p.equipo,
      grupo: mal ? "mal" : "bien",
      motivos,
      horas: p.horasTurno, pantallaPct: n.pantalla, camaraPct: n.camara, tardeMin: p.tardeMin,
      nota: n.nota, pantallaQue: null, estado: null,
    };
  });
  const noVinieron = roster.filter((r) => !vinieron.has(r.userId)).map((r): PersonaEquipo => ({
    userId: r.userId, nombre: r.nombre, equipo: r.equipo, grupo: "noEsta", motivos: [],
    horas: null, pantallaPct: null, camaraPct: null, tardeMin: null, nota: null, pantallaQue: null, estado: "no_vino",
  }));
  return agrupar([...conDatos, ...noVinieron], (p) => p.grupo !== "noEsta");
}
