// LLEGADAS Y PUNTUALIDAD (Alvaro, 18/11/2026, preguntas y respuestas):
//   · «lo primero que quiero saber es quién llegó tarde, quién llegó, quién va
//     abajo en puntos, quién no está trabajando» → los cuatro atajos del inicio.
//   · Tarde = más de 5 minutos después de su hora de entrada de ese día.
//   · La gráfica de horas totales no decía nada → puntualidad de la semana.
//
// Aquí solo hay cuentas puras (se prueban sin red). Los datos los traen
// hooks/useHoyDelEquipo.ts y hooks/usePuntualidadSemana.ts.

import { tonoDe, type FilaDondeEsta } from "@/hooks/useDondeEsta";

/** Minutos de gracia: llegar 10:05 con entrada 10:00 todavía es a tiempo. */
export const TOLERANCIA_TARDE_MIN = 5;

/** Minuto del día (0–1439) en hora de Bogotá de un instante ISO. */
export function minutoBogota(iso: string): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const hhmm = new Date(t).toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
  const [h, m] = hhmm.split(":").map(Number);
  return (h % 24) * 60 + m;
}

/** «HH:MM» de Bogotá de un instante ISO. */
export function horaBogota(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** «08:00:00» u «08:00» → minuto del día. */
export function minutoDeHora(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const [h, m] = hora.split(":").map(Number);
  if (!Number.isFinite(h)) return null;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

/** Minutos tarde (positivo) si pasó la tolerancia; null si llegó a tiempo o no
 *  hay horario. Un turno de noche que «llega» a medianoche no cuenta como tarde
 *  (es la continuación del día anterior). */
export function minutosTarde(entrada: string | null | undefined, llegoIso: string | null | undefined): number | null {
  const e = minutoDeHora(entrada);
  if (e == null || !llegoIso) return null;
  const l = minutoBogota(llegoIso);
  if (l == null) return null;
  const dif = l - e;
  return dif > TOLERANCIA_TARDE_MIN ? dif : null;
}

export interface PersonaDeHoy {
  userId: string;
  nombre: string;
  equipo: string | null;
  /** Hora de entrada de su horario de hoy, «HH:MM». */
  entrada: string | null;
  /** Primera vez que entró a Cowork hoy (ISO). */
  llegoAt: string | null;
  tardeMin: number | null;
  estado: string;
  estadoDesde: string | null;
  /** Nota del día 0–100 (la misma del expediente), o null si aún no hay. */
  nota: number | null;
}

export interface HoyDelEquipo {
  /** Los que ya entraron hoy, en orden de llegada. */
  llegaron: PersonaDeHoy[];
  /** Los que debían estar y todavía no entran. */
  faltan: PersonaDeHoy[];
  /** Los que entraron con más de 5 min de retraso, el más tarde primero. */
  tarde: PersonaDeHoy[];
  /** En su turno y no están trabajando: fuera de Cowork, sin pantalla, sin cámara… */
  noTrabajan: PersonaDeHoy[];
  /** Con nota hoy, de la más baja a la más alta. */
  porNota: PersonaDeHoy[];
}

/** Arma los cuatro atajos a partir de dónde está cada uno, la hora a la que
 *  entró cada quien hoy y la nota del día. */
export function armarHoyDelEquipo(
  donde: FilaDondeEsta[],
  llegadas: Map<string, string>,
  notas: Map<string, number | null>,
): HoyDelEquipo {
  const personas: PersonaDeHoy[] = donde.map((f) => {
    const llegoAt = llegadas.get(f.user_id) ?? null;
    return {
      userId: f.user_id,
      nombre: f.nombre ?? "—",
      equipo: f.equipo,
      entrada: f.entrada ? f.entrada.slice(0, 5) : null,
      llegoAt,
      tardeMin: minutosTarde(f.entrada, llegoAt),
      estado: f.estado,
      estadoDesde: f.estado_desde,
      nota: notas.get(f.user_id) ?? null,
    };
  });
  const llegaron = personas.filter((p) => p.llegoAt)
    .sort((a, b) => Date.parse(a.llegoAt!) - Date.parse(b.llegoAt!));
  const faltan = personas.filter((p) => !p.llegoAt && p.estado === "no_ha_entrado");
  const tarde = llegaron.filter((p) => p.tardeMin != null).sort((a, b) => b.tardeMin! - a.tardeMin!);
  // Mismo criterio que Presencia: rojo y naranja en su turno (gris = fuera de turno).
  const noTrabajan = personas.filter((p) => {
    const tono = tonoDe(p.estado);
    return tono === "rojo" || tono === "naranja";
  });
  const porNota = personas.filter((p) => p.nota != null).sort((a, b) => a.nota! - b.nota!);
  return { llegaron, faltan, tarde, noTrabajan, porNota };
}

export interface DiaPuntual {
  dia: string;
  esHoy: boolean;
  /** Cuántos con horario ese día entraron. */
  llegaron: number;
  tarde: Array<{ userId: string; nombre: string; entrada: string; llegoAt: string; tardeMin: number }>;
}

/** Cuenta, día por día, quién entró tarde según su horario de ese día. */
export function contarPuntualidad(
  dias: string[],
  hoy: string,
  filas: Array<{ dia: string; user_id: string; nombre: string | null; primer_ingreso: string | null }>,
  entradaDe: (dia: string, userId: string) => string | null,
): DiaPuntual[] {
  return dias.map((dia) => {
    const delDia = filas.filter((f) => f.dia?.slice(0, 10) === dia && f.primer_ingreso);
    const tarde: DiaPuntual["tarde"] = [];
    let llegaron = 0;
    for (const f of delDia) {
      const entrada = entradaDe(dia, f.user_id);
      if (!entrada) continue;
      llegaron++;
      const min = minutosTarde(entrada, f.primer_ingreso);
      if (min != null) tarde.push({ userId: f.user_id, nombre: f.nombre ?? "—", entrada: entrada.slice(0, 5), llegoAt: f.primer_ingreso!, tardeMin: min });
    }
    tarde.sort((a, b) => b.tardeMin - a.tardeMin);
    return { dia, esHoy: dia === hoy, llegaron, tarde };
  });
}
