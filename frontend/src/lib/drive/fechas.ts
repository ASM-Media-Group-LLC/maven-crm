// Las fechas del Drive y de la Oficina, como Google (Jhon, 03/10: «la fecha
// tampoco es clara»). Antes, lo de hoy salía como «17:10» a secas: no se sabía
// si era una hora o qué. Ahora:
//   · hoy           → «Hoy, 17:10»   (en inglés, «Today, 5:10 PM»)
//   · este año      → «29 sep»       («Sep 29»)
//   · otro año      → «20 nov 2024»  («Nov 20, 2024»)
// y la fecha completa con la hora para el globito (`title`) y el panel de
// Detalles: «29 de septiembre de 2026, 17:10».
//
// Puras (sin hooks) para poder probarlas con una hora fija. La palabra «Hoy»
// viene de afuera (`hoy`), ya traducida: este archivo no tiene texto propio.
import { formatUI } from "@/lib/formatoHora";
import { format, isSameDay, isSameYear } from "date-fns";
import type { Formato } from "@/lib/formato";

const fecha = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** La hora como se escribe en cada idioma: 17:10 / 5:10 PM. */
export function horaDe(d: Date, f: Formato): string {
  return formatUI(d, f.idioma === "en" ? "h:mm a" : "HH:mm", { locale: f.fechas });
}

/** La fecha corta de una lista. `hoy` arma «Hoy, {hora}» en el idioma de la
 *  pantalla. Sin fecha (o inválida), «—». */
export function fechaCorta(iso: string | null | undefined, f: Formato, hoy: (hora: string) => string, ahora = new Date()): string {
  const d = fecha(iso);
  if (!d) return "—";
  if (isSameDay(d, ahora)) return hoy(horaDe(d, f));
  if (isSameYear(d, ahora)) return format(d, f.idioma === "en" ? "MMM d" : "d MMM", { locale: f.fechas });
  return format(d, f.idioma === "en" ? "MMM d, yyyy" : "d MMM yyyy", { locale: f.fechas });
}

/** La fecha entera con la hora: «29 de septiembre de 2026, 17:10». */
export function fechaCompleta(iso: string | null | undefined, f: Formato): string {
  const d = fecha(iso);
  if (!d) return "—";
  return formatUI(d, f.idioma === "en" ? "MMMM d, yyyy, h:mm a" : "d 'de' MMMM 'de' yyyy, HH:mm", { locale: f.fechas });
}
