import { useCallback, useEffect, useState } from "react";

// useTimezone — preferencia global de zona horaria del usuario. Se guarda
// en localStorage para que persista entre sesiones del mismo browser, y
// se comparte vía storage events si abrís Maven en varias tabs (cambio
// en una tab refresca las demás).
//
// La lista de timezones es curada — sólo las que el equipo usa
// efectivamente (Miami, LA, México, Madrid, Buenos Aires, Bogotá) +
// UTC para devs/auditoría. Si el equipo crece a otra zona, agregar acá.
//
// Default: el TZ del browser cuando el user nunca eligió manualmente.

const STORAGE_KEY = "maven.timezone";

export const TIMEZONE_OPTIONS: Array<{ value: string; label: string; offsetLabel: string }> = [
  { value: "America/New_York", label: "Miami / Nueva York", offsetLabel: "EST/EDT" },
  { value: "America/Los_Angeles", label: "Los Ángeles", offsetLabel: "PST/PDT" },
  { value: "America/Mexico_City", label: "México", offsetLabel: "CST/CDT" },
  { value: "America/Bogota", label: "Bogotá", offsetLabel: "COT" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires", offsetLabel: "ART" },
  { value: "Europe/Madrid", label: "Madrid", offsetLabel: "CET/CEST" },
  { value: "UTC", label: "UTC", offsetLabel: "UTC" },
];

export function getDefaultTimezone(): string {
  // Si el user ya eligió, usar eso. Sino, intentar detectar del browser
  // y matchear con uno de los TIMEZONE_OPTIONS. Sino, fallback a Miami
  // que es el HQ del equipo.
  try {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored && TIMEZONE_OPTIONS.some((o) => o.value === stored)) return stored;
  } catch (_) { /* localStorage puede estar deshabilitado */ }

  try {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TIMEZONE_OPTIONS.some((o) => o.value === browserTz)) return browserTz;
  } catch (_) { /* Intl puede fallar en entornos viejos */ }

  return "America/New_York";
}

export function useTimezone() {
  const [timezone, setTimezoneState] = useState<string>(() => getDefaultTimezone());

  const setTimezone = useCallback((next: string) => {
    setTimezoneState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      // Dispatch storage event manualmente para que otras tabs/hooks
      // que escuchan el mismo key se enteren del cambio (storage event
      // nativo no dispara en la tab que hizo el set).
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: next }));
    } catch (_) { /* ignore */ }
  }, []);

  // Sync entre tabs + entre hooks de la misma tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && e.newValue !== timezone) {
        setTimezoneState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [timezone]);

  return { timezone, setTimezone, options: TIMEZONE_OPTIONS };
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
