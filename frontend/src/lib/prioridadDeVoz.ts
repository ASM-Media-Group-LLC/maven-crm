import type { LecturaDePista } from "./saludDeLlamada";

export const MEDIR_PRIORIDAD_VOZ_MS = 5_000;
const MUESTRAS_MALAS = 2;
const RECUPERACION_MS = 60_000;
const PERDIDA_ALTA_PCT = 5;

export interface EstadoPrioridadVoz {
  activa: boolean;
  malas: number;
  estableDesde: number | null;
}

export const PRIORIDAD_VOZ_INICIAL: EstadoPrioridadVoz = {
  activa: false, malas: 0, estableDesde: null,
};

/** Señales de la subida mientras se publica video. Una muestra sin datos
 * interrumpe la racha, pero no prueba que la red ya se recuperó. */
export function siguientePrioridadVoz(
  actual: EstadoPrioridadVoz,
  pistas: readonly LecturaDePista[],
  ahora: number,
): EstadoPrioridadVoz {
  const mala = pistas.some(({ limite, perdida_pct }) =>
    limite === "bandwidth" || (perdida_pct ?? 0) >= PERDIDA_ALTA_PCT,
  );
  if (mala) {
    const malas = Math.min(MUESTRAS_MALAS, actual.malas + 1);
    return { activa: actual.activa || malas >= MUESTRAS_MALAS, malas, estableDesde: null };
  }
  if (!actual.activa) return PRIORIDAD_VOZ_INICIAL;
  const recuperada = pistas.length > 0 && pistas.every(({ limite, perdida_pct }) =>
    limite === "none" || perdida_pct !== null,
  );
  const estableDesde = recuperada ? actual.estableDesde ?? ahora : null;
  if (estableDesde !== null && ahora - estableDesde >= RECUPERACION_MS) return PRIORIDAD_VOZ_INICIAL;
  return { activa: true, malas: 0, estableDesde };
}
