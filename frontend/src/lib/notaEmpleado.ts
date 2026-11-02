// La NOTA diaria del empleado (Monitor IA · Argos). Alvaro, 02/11/2026.
//
// Una sola cifra 0–100 con color que responde lo único que importa: ¿trabajó
// FULL el día, sí o no? Se arma de los CUATRO factores que Alvaro eligió, con sus
// pesos:
//   · Comparte pantalla  30 %  — lo más importante: que se le vea la pantalla.
//   · En cámara          30 %  — que esté en cámara, la cara visible.
//   · Atención           30 %  — que lo que tiene en pantalla sea TRABAJO (no ocio).
//   · Horas conectado    10 %  — cuánto del día cumplió (meta 8 h).
//
// REGLA DURA: si NO comparte pantalla en todo el día, la nota NO puede pasar de
// 50 (rojo), por bien que haga lo demás. Compartir pantalla no se negocia.
//
// Cuando un factor viene "sin dato", su peso se REPARTE entre los que sí hay (no
// se pierde ni castiga). Si no hay NINGÚN dato, la nota es null.
//
// Función pura y determinista: así el guard la ata sin tocar la red. Más adelante
// Alvaro sumará indicadores POR ROL; entran como un factor más y se re-reparte.

export type BandaNota = "bien" | "ojo" | "mal";

/** Señales crudas de una persona en un período (Hoy o Semana). */
export interface SenalesEmpleado {
  /** Fracción 0–1 del tiempo conectado con la PANTALLA compartida. undefined = sin dato. */
  pantallaPct?: number;
  /** Fracción 0–1 del tiempo con la CÁMARA/cara visible. undefined = sin dato. */
  camaraPct?: number;
  /** Fracción 0–1 de pantallazos juzgados EN LO SUYO (no fuera de lugar). undefined = sin dato. */
  atencionPct?: number;
  /** Horas de reloj efectivas (de cowork_tiempo_diario: seg_activo/3600). */
  horasHechas: number;
  /** Meta de horas del período. undefined = 8 h (jornada). */
  horasMeta?: number;
}

/** Un factor de la nota: su sub-puntaje 0–100 y su peso. El texto legible lo
 *  arma la UI con t(), para que el idioma se traduzca. */
export interface FactorNota {
  clave: "pantalla" | "camara" | "atencion" | "horas";
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
const PESO = { pantalla: 0.3, camara: 0.3, atencion: 0.3, horas: 0.1 } as const;
// Meta de horas por defecto (jornada completa, elección de Alvaro).
const META_HORAS_FALLBACK = 8;
// Si compartió MENOS que esto de pantalla, cuenta como "no compartió": tope 50.
const UMBRAL_SIN_PANTALLA = 0.05;
const TOPE_SIN_PANTALLA = 50;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const pct = (v: number | undefined): number | null => (v === undefined ? null : clamp(v * 100));

export function bandaDeNota(valor: number): BandaNota {
  if (valor >= 80) return "bien";
  if (valor >= 60) return "ojo";
  return "mal";
}

/**
 * Calcula la nota 0–100 de una persona a partir de sus señales.
 */
export function calcularNota(s: SenalesEmpleado): Nota {
  const meta = s.horasMeta && s.horasMeta > 0 ? s.horasMeta : META_HORAS_FALLBACK;
  const subHoras = clamp((s.horasHechas / meta) * 100);

  const factores: FactorNota[] = [
    { clave: "pantalla", sub: pct(s.pantallaPct), peso: PESO.pantalla },
    { clave: "camara", sub: pct(s.camaraPct), peso: PESO.camara },
    { clave: "atencion", sub: pct(s.atencionPct), peso: PESO.atencion },
    { clave: "horas", sub: subHoras, peso: PESO.horas },
  ];

  // Promedio ponderado SOLO con los factores que tienen dato; el peso de los que
  // faltan se reparte (se renormaliza con la suma de pesos presentes).
  const presentes = factores.filter((f) => f.sub !== null);
  const pesoTotal = presentes.reduce((a, f) => a + f.peso, 0);
  if (presentes.length === 0 || pesoTotal === 0) {
    return { valor: null, banda: null, factores };
  }
  let valor = Math.round(presentes.reduce((a, f) => a + (f.sub as number) * f.peso, 0) / pesoTotal);

  // REGLA DURA: sin compartir pantalla en todo el día → tope 50 (rojo), aunque
  // lo demás vaya perfecto. Solo aplica si SABEMOS que no compartió (hay dato).
  if (s.pantallaPct !== undefined && s.pantallaPct < UMBRAL_SIN_PANTALLA) {
    valor = Math.min(valor, TOPE_SIN_PANTALLA);
  }

  return { valor, banda: bandaDeNota(valor), factores };
}
