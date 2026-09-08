import { differenceInCalendarDays, setYear } from "date-fns";

// Edad a partir de la fecha de nacimiento, con un guard de plausibilidad: si el
// resultado cae fuera de [10, 100] la fecha está mal cargada (Yesenia Canales
// tenía `71996-02-09` en prod y el perfil mostraba "-69970 años", 07/09/2026)
// y devolvemos null para que no se dibuje el chip. La fecha sigue siendo la
// que es; esto solo evita mostrar un número absurdo.
export const EDAD_MINIMA_PLAUSIBLE = 10;
export const EDAD_MAXIMA_PLAUSIBLE = 100;

export function edadPlausible(edad: number | null | undefined): edad is number {
  return typeof edad === "number" && Number.isFinite(edad)
    && edad >= EDAD_MINIMA_PLAUSIBLE && edad <= EDAD_MAXIMA_PLAUSIBLE;
}

// `new Date("1996-02-09")` es medianoche UTC: en Bogotá (UTC-5) cae el 8 de
// febrero y el cumpleaños salía un día antes (154 en vez de 155). Se arma la
// fecha en hora LOCAL, componente por componente.
function fechaLocal(iso: string): Date | null {
  const m = /^(\d{1,6})-(\d{1,2})-(\d{1,2})/.exec(iso);
  if (!m) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export function computeAge(birthDate: string, hoy: Date = new Date()): number | null {
  const bd = fechaLocal(birthDate);
  if (!bd) return null;
  let age = hoy.getFullYear() - bd.getFullYear();
  const m = hoy.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < bd.getDate())) age--;
  return edadPlausible(age) ? age : null;
}

export function getDaysUntilBirthday(birthDate: string, hoy: Date = new Date()): number | null {
  if (computeAge(birthDate, hoy) === null) return null;
  const bd = fechaLocal(birthDate)!;
  let next = setYear(bd, hoy.getFullYear());
  if (next < hoy) next = setYear(bd, hoy.getFullYear() + 1);
  return differenceInCalendarDays(next, hoy);
}
