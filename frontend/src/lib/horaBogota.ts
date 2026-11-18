import { usaReloj24 } from "./formatoHora";
// Hora en formato de 12 horas con am/pm (Alvaro, 08/11): el equipo lee la hora en
// am/pm, no en 24h. Recibe una hora YA local "HH:mm" (p. ej. "14:41", que puede
// venir con sufijos como "14:41 (+6m)") y devuelve "2:41 pm". No toca husos: el
// que llama ya resolvió Bogotá al armar el "HH:mm".
export function a12(hhmm: string | null | undefined): string | null {
  if (!hhmm) return null;
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return hhmm;
  // Con hora militar en la empresa (18/11/2026) se deja tal cual.
  if (usaReloj24()) return `${m[1].padStart(2, "0")}:${m[2]}`;
  let h = Number(m[1]);
  const min = m[2];
  if (Number.isNaN(h)) return hhmm;
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ap}`;
}

// Rango "HH:mm — HH:mm" a 12h: "10:00 am — 7:00 pm".
export function rango12(entrada: string | null | undefined, salida: string | null | undefined): string | null {
  const e = a12(entrada);
  const s = a12(salida);
  if (!e || !s) return null;
  return `${e} — ${s}`;
}
