// El día contable de Maven corre en Bogotá (el reloj de Cowork, las tardanzas,
// Argos). Fechas como "AAAA-MM-DD".

/** Hoy en Bogotá. */
export const hoyBogota = (ahora: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(ahora);

/** El lunes de la semana de ese día (la semana arranca el lunes). */
export function lunesDeDia(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Horas en texto corto: «3 h 05 m», «45 m». */
export function horasCortas(horas: number): string {
  const total = Math.round(horas * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} m` : `${m} m`;
}
