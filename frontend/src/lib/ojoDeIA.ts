// CUÁNDO SE LE PREGUNTA A LA IA POR LA CÁMARA (Alvaro, 11/11/2026: «Gemini
// Flash-Lite, solo si algo se ve raro», unos USD 20 al mes en vez de ~190).
//
// Antes se mandaba una foto de la cámara a la IA cada minuto por persona
// (~12.700 al día). Ahora:
//  • si ya hubo una falta (la escalera está apretada o crítica), se sigue
//    preguntando a su ritmo: ahí sí importa cada foto;
//  • si el detector gratis vio un cambio en la cara hace poco (se fue y volvió,
//    dejó de verse, se alejó), se pregunta: es cuando pasa algo;
//  • si no, una revisión de rutina cada 10 minutos, para que el celular con la
//    cara a la vista no pase de largo.

/** Revisión de rutina cuando no se ve nada raro. */
export const IA_DE_RUTINA_MS = 10 * 60_000;
/** Un cambio de la cara más reciente que esto cuenta como «algo raro». */
export const CAMBIO_RECIENTE_MS = 2 * 60_000;

export function debePreguntarIA(p: {
  /** La escalera ya está apretada o crítica (hubo una falta). */
  apretado: boolean;
  /** Cuándo cambió por última vez el estado de la cara (useFaceWatch.since). */
  caraCambio: number;
  /** Cuándo se le preguntó a la IA por última vez (0 = nunca). */
  ultimaIA: number;
  ahora: number;
}): boolean {
  if (p.apretado) return true;
  if (p.ahora - p.caraCambio < CAMBIO_RECIENTE_MS) return true;
  return p.ahora - p.ultimaIA >= IA_DE_RUTINA_MS;
}
