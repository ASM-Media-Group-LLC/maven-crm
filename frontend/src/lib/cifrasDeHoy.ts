// «LOS NÚMEROS DE HOY» → UNA PANTALLA POR NÚMERO (Alvaro, 20/11/2026: «cada
// cosa debería mandarme a una pantalla», con la gente en tarjetas en vivo como
// Presencia de Argos). Cada número del inicio lleva a /hoy/<cifra>.

export const CIFRAS = [
  "tarde", "llegaron", "horarios", "nota-baja", "no-trabajan",
  "en-cowork", "nota-equipo", "trabajando", "con-problemas",
  "cowork-hoy", "mensajes", "respuesta",
] as const;

export type Cifra = (typeof CIFRAS)[number];

export function esCifra(x: string | undefined): x is Cifra {
  return !!x && (CIFRAS as readonly string[]).includes(x);
}

export const rutaDeCifra = (c: Cifra): string => `/hoy/${c}`;

/** «7 h 05 min», «45 min». */
export function horasYMinutos(horas: number): { h: number; m: number } {
  const total = Math.max(0, Math.round(horas * 60));
  return { h: Math.floor(total / 60), m: total % 60 };
}
