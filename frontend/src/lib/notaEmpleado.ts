// NOTA v3 (Alvaro, 18/11/2026, preguntas y respuestas: «no puede ser por una
// sola cosa: cuántas veces le llamó la atención Argos, si llegó temprano…»; y
// «pantalla y cámara se miden sobre el tiempo CONECTADO, no hasta el final del
// turno»). Seis partes, con «más peso a los llamados»:
//   · Llamados de Argos 25 — empieza completo; cada llamado de atención resta y
//     si Argos lo reportó al supervisor resta el doble.
//   · Atención          20 — pantallazos en lo suyo.
//   · Pantalla          15 — % del tiempo CONECTADO compartiendo.
//   · Puntualidad       15 — a tiempo (≤ 5 min) completo; a los 30 min tarde, 0.
//   · En su puesto      15 — minutos fuera de Cowork en su turno (y salir antes);
//                             a los 30 min, 0.
//   · Cámara            10 — % del tiempo CONECTADO con la cara visible.
// La regla dura de la pantalla sigue (sin pantalla, tope 50). Un factor sin dato
// reparte su peso, como siempre. Lo de abajo es la historia de la v2.
//
// La NOTA diaria del empleado (Monitor IA · Argos). Alvaro, 05/11/2026 (v2).
//
// Una sola cifra 0–100 que responde lo único que importa: ¿trabajó FULL el turno,
// sí o no? Tres factores con los pesos que eligió Alvaro:
//   · Comparte pantalla  45 %  — lo más fuerte: que se le vea la pantalla.
//   · En cámara          35 %  — que esté en cámara, la cara visible.
//   · Distracción        20 %  — que lo que hace sea TRABAJO (no fuera de lugar).
//
// LAS HORAS VAN METIDAS DENTRO de pantalla/cámara: se miden sobre el TURNO COMPLETO
// (8 h menos la pausa libre), no sobre el ratito que estuvo. Así medio turno ≈ 50 %
// y nadie llega arriba sin haber trabajado la jornada entera compartiendo. Por eso
// ya no hay un factor "Horas" aparte (era lo que confundía).
//
// La pausa libre (baño + comida) NO castiga: se descuenta del denominador. En esta
// primera versión es fija (baño 10 + comida 30 = 40 min); el panel del admin la
// hará por rol/persona.
//
// REGLA DURA: si NO comparte pantalla en todo el turno, la nota NO pasa de 50
// (rojo), por bien que haga lo demás. Compartir pantalla no se negocia.
//
// Cuando un factor viene "sin dato", su peso se REPARTE entre los que sí hay. Si no
// hay NINGÚN dato, la nota es null. Función pura y determinista (el guard la ata sin
// tocar la red).

export type BandaNota = "bien" | "ojo" | "mal";

// Pausa libre exenta del denominador (segundos). Fija por ahora (baño 10 + comida
// 30); el panel del admin la hará configurable por rol/persona.
export const EXENTO_SEG = 40 * 60;
// Jornada por defecto (horas) si el que llama no pasa otra.
export const JORNADA_HORAS = 8;

/** Fracción 0–1 de la JORNADA que cubren esos segundos de trabajo (pantalla o
 *  cámara), con la pausa libre (baño + comida) ya descontada del denominador.
 *  Tope 1. `exentoSeg` por rol/persona (default baño 10 + comida 30 = 40 min). */
export function fraccionJornada(segundos: number, horasJornada = JORNADA_HORAS, exentoSeg = EXENTO_SEG): number {
  const denom = Math.max(1, horasJornada * 3600 - Math.max(0, exentoSeg));
  return Math.min(1, Math.max(0, segundos) / denom);
}

/** Fracción 0–1 del tiempo CONECTADO (trabajando en Cowork) que cubren esos
 *  segundos (v3, 18/11/2026). Sin tiempo conectado no hay dato. */
export function fraccionConectado(segundos: number, segConectado: number): number | undefined {
  if (!(segConectado > 0)) return undefined;
  return Math.min(1, Math.max(0, segundos) / segConectado);
}

/** A los cuántos minutos (tarde o fuera) la parte llega a 0. */
export const MINUTOS_HASTA_CERO = 30;
/** Cuánto resta del sub-puntaje (0–100) cada llamado de atención de Argos; un
 *  llamado reportado al supervisor resta el doble. */
export const RESTA_POR_LLAMADO = 15;

/** Señales crudas de una persona en un período. */
export interface SenalesEmpleado {
  /** Minutos tarde pasada la tolerancia. null = llegó a tiempo; undefined = sin horario/sin dato. */
  tardeMin?: number | null;
  /** Llamados de atención de Argos en el período (undefined = sin dato). */
  llamados?: number;
  /** De esos, cuántos se reportaron al supervisor. */
  escalados?: number;
  /** Minutos fuera de su puesto en su turno (fuera de Cowork + salir antes). undefined = sin dato. */
  minFuera?: number;
  /** Fracción 0–1 del TURNO con la PANTALLA compartida. undefined = sin dato / no se califica. */
  pantallaPct?: number;
  /** Fracción 0–1 del TURNO con la CÁMARA/cara visible. undefined = sin dato / no se califica. */
  camaraPct?: number;
  /** Fracción 0–1 de pantallazos juzgados EN LO SUYO (no fuera de lugar; las
   *  perdonadas cuentan como en lo suyo). undefined = sin dato. */
  atencionPct?: number;
}

/** Un factor de la nota: su sub-puntaje 0–100 y su peso. El texto legible lo arma
 *  la UI con t(). */
export interface FactorNota {
  clave: "pantalla" | "camara" | "atencion" | "puntualidad" | "llamados" | "puesto";
  /** 0–100, o null si no había dato. */
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
// v3 (18/11/2026): «más peso a los llamados».
const PESO = { llamados: 0.25, atencion: 0.2, pantalla: 0.15, puntualidad: 0.15, puesto: 0.15, camara: 0.1 } as const;
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

/** Calcula la nota 0–100 de una persona a partir de sus señales. */
export function calcularNota(s: SenalesEmpleado): Nota {
  const hastaCero = (min: number) => clamp(100 * (1 - Math.max(0, min) / MINUTOS_HASTA_CERO));
  const factores: FactorNota[] = [
    { clave: "llamados", sub: s.llamados === undefined ? null : clamp(100 - RESTA_POR_LLAMADO * (s.llamados + (s.escalados ?? 0))), peso: PESO.llamados },
    { clave: "atencion", sub: pct(s.atencionPct), peso: PESO.atencion },
    { clave: "pantalla", sub: pct(s.pantallaPct), peso: PESO.pantalla },
    { clave: "puntualidad", sub: s.tardeMin === undefined ? null : s.tardeMin === null ? 100 : hastaCero(s.tardeMin), peso: PESO.puntualidad },
    { clave: "puesto", sub: s.minFuera === undefined ? null : hastaCero(s.minFuera), peso: PESO.puesto },
    { clave: "camara", sub: pct(s.camaraPct), peso: PESO.camara },
  ];

  // Promedio ponderado SOLO con los factores que tienen dato; el peso de los que
  // faltan se reparte (se renormaliza con la suma de pesos presentes).
  const presentes = factores.filter((f) => f.sub !== null);
  const pesoTotal = presentes.reduce((a, f) => a + f.peso, 0);
  if (presentes.length === 0 || pesoTotal === 0) {
    return { valor: null, banda: null, factores };
  }
  let valor = Math.round(presentes.reduce((a, f) => a + (f.sub as number) * f.peso, 0) / pesoTotal);

  // REGLA DURA: sin compartir pantalla en todo el turno → tope 50 (rojo). Solo
  // aplica si SABEMOS que no compartió (hay dato).
  if (s.pantallaPct !== undefined && s.pantallaPct < UMBRAL_SIN_PANTALLA) {
    valor = Math.min(valor, TOPE_SIN_PANTALLA);
  }

  return { valor, banda: bandaDeNota(valor), factores };
}
