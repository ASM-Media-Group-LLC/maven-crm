import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import type { Formato } from "@/lib/formato";

const MIAMI_TZ = "America/New_York";

/** Format a date to Miami timezone with a given format string.
 *  `f` = useFormato() (o formatoActual()): el mes y el día salen en el idioma de la interfaz. */
export function formatToMiamiTime(date: Date | string, formatStr: string, f: Formato): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, MIAMI_TZ, formatStr, { locale: f.fechas });
}

/** Get the current Date in Miami timezone */
export function getMiamiTime(): Date {
  return toZonedTime(new Date(), MIAMI_TZ);
}

/** Convert any date to Miami timezone */
export function toMiamiTime(date: Date | string): Date {
  const d = typeof date === "string" ? new Date(date) : date;
  return toZonedTime(d, MIAMI_TZ);
}

/** Get today's date string in Miami (YYYY-MM-DD) */
export function getMiamiDateStr(): string {
  return formatInTimeZone(new Date(), MIAMI_TZ, "yyyy-MM-dd");
}
