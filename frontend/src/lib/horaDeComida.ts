// HORA DE COMIDA (Alvaro, 27/11/2026): reglas puras del recordatorio, sin
// navegador, para poder probarlas.

/** La fecha (AAAA-MM-DD) y los minutos desde medianoche, en hora de Bogotá. */
export function horaBogotaAhora(ahora: Date): { hoy: string; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(ahora);
  const v = (k: string) => partes.find((p) => p.type === k)?.value ?? "00";
  return { hoy: `${v("year")}-${v("month")}-${v("day")}`, minutos: Number(v("hour")) * 60 + Number(v("minute")) };
}

/** «12:30» → 750. Null si no es una hora válida. */
export function minutosDe(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** ¿Toca avisar ahora? Desde la hora y hasta 10 min después (por si la pestaña
 *  estaba dormida justo en ese minuto), una sola vez por día. */
export function debeRecordarComida(hora: string, minutosAhora: number, hoy: string, ultimaVez: string | null): boolean {
  const objetivo = minutosDe(hora);
  if (objetivo === null || ultimaVez === hoy) return false;
  return minutosAhora >= objetivo && minutosAhora < objetivo + 10;
}
