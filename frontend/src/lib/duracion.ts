// MINUTOS EN HORAS (Alvaro, 18/11/2026: «dame en horas, en toda la plataforma,
// no 538 min»). Hasta 59 se dice en minutos; de 60 en adelante, «8 h 58 min».

/** 45 → «45 min»; 538 → «8 h 58 min»; 120 → «2 h». */
export function enHoras(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** En un texto con «{n} min» (o «{n} minutos»/«{n} minutes»), si n llega a 60
 *  se cambia por horas. Lo usa el traductor para TODA la plataforma. */
export function minutosEnHorasEnPlantilla(plantilla: string, params: Record<string, string | number>): string {
  let s = plantilla;
  for (const [k, v] of Object.entries(params)) {
    const n = typeof v === "number" ? v : /^\d+$/.test(String(v).trim()) ? Number(v) : NaN;
    if (!Number.isFinite(n) || n < 60) continue;
    s = s.replace(new RegExp(`\\{${k}\\} (?:minutos|minutes|min)\\b`, "g"), enHoras(n));
  }
  return s;
}
