// useTimezone — zona horaria de Maven. NO es configurable.
//
// GMT-5 (America/Bogota) es la zona oficial del CRM: es la hora en la que opera
// el equipo y en la que se leen todos los números. Antes cada quien podía elegir
// la suya desde el topbar y, peor, el default era America/New_York — que es
// GMT-5 en invierno pero GMT-4 en verano, así que media parte del año las
// pantallas de Promolog mostraban una hora corrida para quien no lo hubiera
// tocado nunca. Fijarla arregla eso además de simplificar.
//
// Bogotá no tiene horario de verano: GMT-5 todo el año, sin excepciones.

/** La zona de Maven. Si algún día cambia, se cambia acá y en ningún otro lado. */
export const ZONA_MAVEN = "America/Bogota";

export function useTimezone() {
  return { timezone: ZONA_MAVEN };
}

// ─── Format helpers ─────────────────────────────────────────────────

interface FormatOptions {
  /** Locale BCP47 — default "es-ES". */
  locale?: string;
  /** Intl.DateTimeFormat options. */
  options?: Intl.DateTimeFormatOptions;
}

/** Parsea un input que puede venir como Date o string. Si es string SIN
 *  info de zona (ej "2026-05-28T23:12:45" — típico de columnas Postgres
 *  `timestamp without time zone` como `promolog_entries.date`), asume
 *  UTC y agrega "Z" para evitar que JS lo interprete como hora local del
 *  browser. Si la string ya tiene "Z" o un offset "+HH:MM" / "-HH:MM",
 *  se respeta tal como vino. */
function parseAsUtcIfNaive(input: Date | string): Date {
  if (input instanceof Date) return input;
  const s = String(input);
  // ¿Tiene info de zona explícita? Z al final, o +HH:MM / -HH:MM antes de fin.
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasZone ? s : s + "Z");
}

/** Devuelve "28 may 2026" en el TZ dado. */
export function formatDateInTz(input: Date | string, tz: string, opts?: FormatOptions): string {
  const date = parseAsUtcIfNaive(input);
  if (isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(opts?.locale ?? "es-ES", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts?.options,
  }).format(date);
}

/** Devuelve la fecha-calendario "YYYY-MM-DD" en el TZ dado. Para AGRUPAR/COMPARAR
 *  por día (la columna `date` es timestamp naive-UTC): una promo de las 23:45 en
 *  Bogotá vive en UTC como 04:45 del día siguiente — agrupar por slice(0,10) la
 *  mandaría al día equivocado. en-CA da el formato YYYY-MM-DD. */
export function dayKeyInTz(input: Date | string, tz: string): string {
  const date = parseAsUtcIfNaive(input);
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Devuelve "06:12 PM" en el TZ dado. */
export function formatTimeInTz(input: Date | string, tz: string, opts?: FormatOptions): string {
  const date = parseAsUtcIfNaive(input);
  if (isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(opts?.locale ?? "es-ES", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...opts?.options,
  }).format(date);
}

/** Devuelve "28 may 2026, 06:12 PM" en el TZ dado. */
export function formatDateTimeInTz(input: Date | string, tz: string, opts?: FormatOptions): string {
  return `${formatDateInTz(input, tz, opts)}, ${formatTimeInTz(input, tz, opts)}`;
}

/** Abbreviation del TZ ("EDT", "PST", "ART") según la fecha (porque
 *  algunos cambian DST). Usado para mostrar el TZ activo en chips. */
export function getTimezoneAbbreviation(tz: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart?.value ?? tz;
  } catch (_) {
    return tz;
  }
}
