// La NOTA del empleado (Monitor IA · Argos). Alvaro, 31/10/2026.
//
// Una sola cifra 0–100 con color (verde/ámbar/rojo) que dice de un vistazo si la
// persona va bien o mal, para Hoy o para la Semana. Se arma de CUATRO factores,
// los que Alvaro eligió:
//   · Horas cumplidas         (vs su meta del día/semana)
//   · Sin faltas del monitor   (cámara apagada, celular, se fue, distraído, no mira)
//   · Puntualidad              (llegó a tiempo / no faltó)
//   · Pausas dentro del límite (comida 30 · baño 10 con 20 de espera; lo de más resta)
//
// IMPORTANTE: no todos tienen horario cargado (puntualidad/meta de horas viven en
// whatsapp_user_schedules y hoy solo cubren a parte del equipo). Por eso cada
// factor puede venir "sin dato": su peso NO se pierde, se REPARTE entre los que sí
// hay, para que la nota siga siendo justa. Si no hay NINGÚN dato, la nota es null.
//
// Función pura y determinista a propósito: así el guard la ata sin tocar la red.

export type BandaNota = "bien" | "ojo" | "mal";

/** Señales crudas de una persona en un período (Hoy o Semana). */
export interface SenalesEmpleado {
  /** Horas de reloj efectivas (de equipo_tiempo_cowork: seg_activo/3600). */
  horasHechas: number;
  /** Meta de horas del período (de su horario). undefined = sin horario cargado. */
  horasMeta?: number;
  /** # de faltas SERIAS del monitor (camara_apagada|se_fue|celular|distraido|no_mira). */
  faltasSerias: number;
  /** Minutos de tardanza acumulados en el período. undefined = sin horario. */
  minutosTarde?: number;
  /** No se conectó en un día que debía. undefined = sin horario. */
  ausente?: boolean;
  /** Minutos de pausa POR ENCIMA del límite (seg_*_de_mas / 60). undefined = sin dato de pausas. */
  minutosPausaDeMas?: number;
}

/** Un factor de la nota: su sub-puntaje 0–100 y su peso. El texto legible
 *  (label + detalle) lo arma la UI con t(), para que el botón EN lo traduzca. */
export interface FactorNota {
  clave: "horas" | "faltas" | "puntualidad" | "pausas";
  /** 0–100, o null si no había dato para calcularlo. */
  sub: number | null;
  /** Peso relativo del factor (antes de repartir). */
  peso: number;
}

export interface Nota {
  /** 0–100 redondeado, o null si no se pudo calcular ningún factor. */
  valor: number | null;
  banda: BandaNota | null;
  factores: FactorNota[];
}

// Pesos base (suman 1). Si un factor no tiene dato, su peso se reparte.
const PESO = { horas: 0.3, faltas: 0.3, puntualidad: 0.2, pausas: 0.2 } as const;

// Cuánto castiga cada cosa (ajustable; Alvaro puede pedir subir/bajar la mano).
const PENAL_POR_FALTA = 12; // cada falta seria resta 12 pts del sub de faltas
const PENAL_POR_MIN_TARDE = 3; // cada minuto tarde resta 3 pts del sub de puntualidad
const PENAL_POR_MIN_PAUSA = 2; // cada minuto de pausa de más resta 2 pts del sub de pausas
// Meta de horas por defecto cuando no hay horario cargado (jornada típica).
const META_HORAS_FALLBACK = 6;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function bandaDeNota(valor: number): BandaNota {
  if (valor >= 80) return "bien";
  if (valor >= 60) return "ojo";
  return "mal";
}

/**
 * Calcula la nota 0–100 de una persona a partir de sus señales.
 * Los labels/detalles se arman fuera (i18n); aquí van en español neutro como
 * respaldo y para el guard.
 */
export function calcularNota(s: SenalesEmpleado): Nota {
  // --- Horas cumplidas ---
  const meta = s.horasMeta && s.horasMeta > 0 ? s.horasMeta : META_HORAS_FALLBACK;
  const subHoras = clamp((s.horasHechas / meta) * 100);

  // --- Sin faltas del monitor ---
  const subFaltas = clamp(100 - s.faltasSerias * PENAL_POR_FALTA);

  // --- Puntualidad (solo si hay horario) ---
  let subPunt: number | null = null;
  if (s.ausente !== undefined || s.minutosTarde !== undefined) {
    subPunt = s.ausente ? 0 : clamp(100 - (s.minutosTarde ?? 0) * PENAL_POR_MIN_TARDE);
  }

  // --- Pausas dentro del límite (solo si hay dato de pausas) ---
  let subPausas: number | null = null;
  if (s.minutosPausaDeMas !== undefined) {
    subPausas = clamp(100 - Math.max(0, s.minutosPausaDeMas) * PENAL_POR_MIN_PAUSA);
  }

  const factores: FactorNota[] = [
    { clave: "horas", sub: subHoras, peso: PESO.horas },
    { clave: "faltas", sub: subFaltas, peso: PESO.faltas },
    { clave: "puntualidad", sub: subPunt, peso: PESO.puntualidad },
    { clave: "pausas", sub: subPausas, peso: PESO.pausas },
  ];

  // Promedio ponderado SOLO con los factores que tienen dato; el peso de los que
  // faltan se reparte solo (se renormaliza con la suma de pesos presentes).
  const presentes = factores.filter((f) => f.sub !== null);
  const pesoTotal = presentes.reduce((a, f) => a + f.peso, 0);
  if (presentes.length === 0 || pesoTotal === 0) {
    return { valor: null, banda: null, factores };
  }
  const valor = Math.round(presentes.reduce((a, f) => a + (f.sub as number) * f.peso, 0) / pesoTotal);

  return { valor, banda: bandaDeNota(valor), factores };
}
