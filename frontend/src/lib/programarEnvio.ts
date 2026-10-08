// «Programar envío»: a qué instante corresponde cada opción del menú, SIEMPRE en
// hora de Colombia (Keila y Jhon, 08/10: como Gmail y Google Chat, «hora
// estándar de Colombia»).
//
// Suelto, sin React, porque acá está lo que se equivoca solo: «mañana» depende de
// la hora en que se toca el botón y del huso horario del equipo. Con la hora
// LOCAL, alguien con el computador en otro país programaba «mañana a las 8» y
// el correo salía a las 8 de SU país, no de Bogotá.
//
// Colombia no tiene horario de verano: UTC−5 todo el año. Por eso es un
// desfase fijo y no una tabla de zonas.

export const ZONA = "America/Bogota";
const DESFASE_MS = -5 * 60 * 60 * 1000;

export interface PartesEnBogota {
  anio: number;
  /** 1-12 */
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  /** 0 domingo … 6 sábado */
  diaSemana: number;
}

/** El instante visto en Bogotá. */
export function partesEnBogota(d: Date): PartesEnBogota {
  const b = new Date(d.getTime() + DESFASE_MS);
  return {
    anio: b.getUTCFullYear(),
    mes: b.getUTCMonth() + 1,
    dia: b.getUTCDate(),
    hora: b.getUTCHours(),
    minuto: b.getUTCMinutes(),
    diaSemana: b.getUTCDay(),
  };
}

/** El instante de una fecha y hora DE BOGOTÁ. Los días se pueden pasar del
 *  mes (32 de octubre = 1 de noviembre): Date.UTC los acomoda. */
export function instanteEnBogota(anio: number, mes: number, dia: number, hora: number, minuto = 0): Date {
  return new Date(Date.UTC(anio, mes - 1, dia, hora, minuto) - DESFASE_MS);
}

export const HORA_MANANA = 8;
export const HORA_TARDE = 13;

export interface OpcionDeProgramar {
  clave: "manana" | "tarde" | "lunes";
  cuando: Date;
}

/**
 * Las opciones del menú, en orden: mañana 8:00, mañana 13:00 y el próximo
 * lunes 8:00 (las de Google Chat).
 *
 * ⚠️ «Mañana» es el día siguiente EN BOGOTÁ: a las 11 de la noche en Bogotá ya
 * es mañana en UTC, y tomar ese día programaría para pasado mañana.
 * ⚠️ El domingo, «el próximo lunes» ES mañana a las 8: se ofrecería dos veces la
 * misma hora, así que no aparece.
 */
export function opcionesDeProgramar(ahora: Date = new Date()): OpcionDeProgramar[] {
  const hoy = partesEnBogota(ahora);
  const manana = instanteEnBogota(hoy.anio, hoy.mes, hoy.dia + 1, HORA_MANANA);
  // Días hasta el lunes: de lunes (1) son 7, no 0.
  const faltan = ((8 - hoy.diaSemana) % 7) || 7;
  const lunes = instanteEnBogota(hoy.anio, hoy.mes, hoy.dia + faltan, HORA_MANANA);
  const opciones: OpcionDeProgramar[] = [
    { clave: "manana", cuando: manana },
    { clave: "tarde", cuando: instanteEnBogota(hoy.anio, hoy.mes, hoy.dia + 1, HORA_TARDE) },
  ];
  if (lunes.getTime() !== manana.getTime()) opciones.push({ clave: "lunes", cuando: lunes });
  return opciones;
}

/** Lo que se acepta en «Elegir fecha y hora»: al menos un minuto adelante (un
 *  envío «programado» para ahora es un envío) y hasta un año (lo mismo que
 *  acepta el servidor). */
export const MINIMO_ADELANTE_MS = 60 * 1000;
export const HORIZONTE_MS = 365 * 24 * 60 * 60 * 1000;

export type HoraElegida =
  | { ok: true; cuando: Date }
  | { ok: false; motivo: "fecha" | "hora" | "pasado" | "lejos" };

/** «DD/MM/AAAA» y «HH:mm» (24 h) de Bogotá → el instante, o por qué no. */
export function leerFechaYHora(fecha: string, hora: string, ahora: Date = new Date()): HoraElegida {
  const f = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(fecha.trim());
  if (!f) return { ok: false, motivo: "fecha" };
  const [dia, mes, anio] = [Number(f[1]), Number(f[2]), Number(f[3])];
  // Un 31/02 no es «3 de marzo»: se rechaza en vez de acomodarlo.
  const prueba = new Date(Date.UTC(anio, mes - 1, dia));
  if (prueba.getUTCMonth() !== mes - 1 || prueba.getUTCDate() !== dia) return { ok: false, motivo: "fecha" };
  const h = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!h || Number(h[1]) > 23 || Number(h[2]) > 59) return { ok: false, motivo: "hora" };
  const cuando = instanteEnBogota(anio, mes, dia, Number(h[1]), Number(h[2]));
  const dif = cuando.getTime() - ahora.getTime();
  if (dif < MINIMO_ADELANTE_MS) return { ok: false, motivo: "pasado" };
  if (dif > HORIZONTE_MS) return { ok: false, motivo: "lejos" };
  return { ok: true, cuando };
}

const dos = (n: number) => String(n).padStart(2, "0");

/** «09/10/2026» y «08:00» de un instante, en Bogotá: con qué arranca el diálogo. */
export function fechaYHoraDe(d: Date): { fecha: string; hora: string } {
  const p = partesEnBogota(d);
  return { fecha: `${dos(p.dia)}/${dos(p.mes)}/${p.anio}`, hora: `${dos(p.hora)}:${dos(p.minuto)}` };
}

const locale = (idioma: string) => (idioma === "en" ? "en-US" : "es-CO");

/** «jue, 9 oct»: la fecha concreta al lado de cada opción del menú. */
export function fechaCorta(d: Date, idioma: string): string {
  return new Intl.DateTimeFormat(locale(idioma), { timeZone: ZONA, weekday: "short", day: "numeric", month: "short" })
    .format(d);
}

/** «8:00 a. m.» en Bogotá. */
export function horaCorta(d: Date, idioma: string, zona: string = ZONA): string {
  return new Intl.DateTimeFormat(locale(idioma), { timeZone: zona, hour: "numeric", minute: "2-digit", hour12: true })
    .format(d);
}

/** «jueves, 9 de octubre»: para la frase que repite lo elegido. */
export function fechaLarga(d: Date, idioma: string): string {
  return new Intl.DateTimeFormat(locale(idioma), { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" })
    .format(d);
}

/** La zona del equipo, si NO es la de Colombia (null si es la misma hora). Para
 *  avisar «en tu equipo serán las 9:00»: quien está en otro país tiene que ver
 *  a qué hora de SU día sale. */
export function zonaDelEquipoSiDistinta(d: Date): string | null {
  try {
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zona) return null;
    const local = new Intl.DateTimeFormat("en-US", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23", day: "2-digit" }).format(d);
    const bogota = new Intl.DateTimeFormat("en-US", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23", day: "2-digit" }).format(d);
    return local === bogota ? null : zona;
  } catch {
    return null;
  }
}
