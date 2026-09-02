// Las reglas de Cowork DE UNA SESIÓN: qué alertas existen, cuándo se le avisa a
// la persona, cada cuánto se repite y cuándo se entera el supervisor.
//
// Hasta hoy estos números eran constantes escritas en el código y eran las
// mismas para toda la empresa. Al abrir Cowork a más departamentos eso dejó de
// servir: a las managers no se les puede reclamar la pantalla porque no es su
// norma. Las reglas ahora viven en la sesión (columna `alert_rules` de
// `cowork_sessions`): el supervisor las cambia una vez y aplican a todos los
// que están adentro, hoy y en adelante.
//
// ── DÓNDE SE LEEN, Y POR QUÉ HAY UN "STORE" FUERA DE REACT ─────────────────
// Los avisos a la persona corren DENTRO de la llamada (que sobrevive a navegar
// a otra sección de Maven); la página de Cowork, que es quien conoce la sesión,
// no sobrevive. Igual que `coworkPausa`, las reglas se guardan en una variable
// de módulo que la página actualiza y que los avisos consultan EN CADA TIC. Así
// un cambio del supervisor llega en vivo sin remontar la llamada.
//
// ── UNA SOLA FUENTE ────────────────────────────────────────────────────────
// Todo el que decide algo por tiempo —el aviso a la persona, el aviso al
// supervisor, el registro de llamados— pasa por acá. Repartir los umbrales en
// tres archivos fue justamente lo que dejó a los chatters sin poder cambiar
// nada.

export type Preset = "estricto" | "estandar" | "relajado" | "personalizado";

/** Una alerta por tiempo: cámara, encuadre o pantalla. */
export interface ReglaAviso {
  /** Apagada = no existe en esta sesión: ni aviso, ni supervisor, ni registro. */
  activa: boolean;
  /** Segundos con el problema hasta el PRIMER aviso a la persona. */
  primerAvisoSeg: number;
  /** Cada cuántos segundos se le repite. */
  repetirSeg: number;
  /** Segundos hasta avisarle al supervisor (y dejar registro). null = nunca. */
  supervisorSeg: number | null;
}

export interface ReglaPausas {
  /** Presupuesto DIARIO de baño, en minutos. */
  banoMin: number;
  /** Tope de cada break, en minutos. */
  breakMin: number;
  /** Segundos pasado el tope hasta avisarle al supervisor. null = nunca. */
  supervisorSeg: number | null;
}

export interface ReglasCowork {
  preset: Preset;
  camara: ReglaAviso;
  /** Sin rostro, fuera de cuadro o con poca luz. */
  encuadre: ReglaAviso;
  pantalla: ReglaAviso;
  pausas: ReglaPausas;
}

// Lo que Cowork hace HOY con los chatters, número por número. Es el punto de
// partida de toda sesión sin reglas propias, así que cambiar algo acá cambia
// el comportamiento de toda la empresa: hacerlo a conciencia.
export const REGLAS_ESTANDAR: ReglasCowork = {
  preset: "estandar",
  camara:   { activa: true, primerAvisoSeg: 90,  repetirSeg: 90,  supervisorSeg: 180 },
  encuadre: { activa: true, primerAvisoSeg: 90,  repetirSeg: 90,  supervisorSeg: 180 },
  pantalla: { activa: true, primerAvisoSeg: 120, repetirSeg: 120, supervisorSeg: 300 },
  pausas:   { banoMin: 10, breakMin: 30, supervisorSeg: 180 },
};

const REGLAS_ESTRICTO: ReglasCowork = {
  preset: "estricto",
  camara:   { activa: true, primerAvisoSeg: 60, repetirSeg: 60, supervisorSeg: 120 },
  encuadre: { activa: true, primerAvisoSeg: 60, repetirSeg: 60, supervisorSeg: 120 },
  pantalla: { activa: true, primerAvisoSeg: 60, repetirSeg: 60, supervisorSeg: 180 },
  pausas:   { banoMin: 10, breakMin: 30, supervisorSeg: 60 },
};

// Relajado apaga la pantalla: es el caso de las managers, que no están
// obligadas a compartirla. La cámara y el encuadre siguen —presencia sí se
// pide— pero con más margen y sin escalar al supervisor.
const REGLAS_RELAJADO: ReglasCowork = {
  preset: "relajado",
  camara:   { activa: true,  primerAvisoSeg: 180, repetirSeg: 300, supervisorSeg: null },
  encuadre: { activa: true,  primerAvisoSeg: 180, repetirSeg: 300, supervisorSeg: null },
  pantalla: { activa: false, primerAvisoSeg: 120, repetirSeg: 120, supervisorSeg: 300 },
  pausas:   { banoMin: 10, breakMin: 45, supervisorSeg: null },
};

export const PRESETS: Record<Exclude<Preset, "personalizado">, ReglasCowork> = {
  estricto: REGLAS_ESTRICTO,
  estandar: REGLAS_ESTANDAR,
  relajado: REGLAS_RELAJADO,
};

/** Las opciones que ofrece el panel. Cerradas a propósito: un menú de ocho
 *  valores se entiende de un vistazo; un campo libre invita al "0" y al
 *  "99999". En segundos. */
export const OPCIONES_SEG = [30, 60, 90, 120, 180, 300, 600, 900] as const;
export const OPCIONES_BANO_MIN = [5, 10, 15, 20] as const;
export const OPCIONES_BREAK_MIN = [15, 30, 45, 60] as const;

const SEG_MIN = 30, SEG_MAX = 3600;
const MIN_MIN = 1, MIN_MAX = 240;

function numeroEntre(v: unknown, min: number, max: number, porDefecto: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** null explícito = "nunca". Cualquier otra cosa inválida cae al valor por defecto. */
function segundosONunca(v: unknown, porDefecto: number | null): number | null {
  if (v === null) return null;
  if (v === undefined) return porDefecto;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(SEG_MAX, Math.max(SEG_MIN, Math.round(n)));
}

function normalizarAviso(raw: unknown, base: ReglaAviso): ReglaAviso {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    activa: typeof r.activa === "boolean" ? r.activa : base.activa,
    primerAvisoSeg: numeroEntre(r.primerAvisoSeg, SEG_MIN, SEG_MAX, base.primerAvisoSeg),
    repetirSeg: numeroEntre(r.repetirSeg, SEG_MIN, SEG_MAX, base.repetirSeg),
    supervisorSeg: segundosONunca(r.supervisorSeg, base.supervisorSeg),
  };
}

function normalizarPausas(raw: unknown, base: ReglaPausas): ReglaPausas {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    banoMin: numeroEntre(r.banoMin, MIN_MIN, MIN_MAX, base.banoMin),
    breakMin: numeroEntre(r.breakMin, MIN_MIN, MIN_MAX, base.breakMin),
    supervisorSeg: segundosONunca(r.supervisorSeg, base.supervisorSeg),
  };
}

/** ¿Estas dos reglas dicen exactamente lo mismo, número por número? (sin
 *  mirar el preset). Lo usa el panel para saber si hay algo que guardar y el
 *  detector de preset; una sola copia, para que nunca discrepen. */
export function mismasReglas(a: ReglasCowork, b: ReglasCowork): boolean {
  const aviso = (x: ReglaAviso, y: ReglaAviso) =>
    x.activa === y.activa && x.primerAvisoSeg === y.primerAvisoSeg &&
    x.repetirSeg === y.repetirSeg && x.supervisorSeg === y.supervisorSeg;
  return aviso(a.camara, b.camara) && aviso(a.encuadre, b.encuadre) && aviso(a.pantalla, b.pantalla)
    && a.pausas.banoMin === b.pausas.banoMin && a.pausas.breakMin === b.pausas.breakMin
    && a.pausas.supervisorSeg === b.pausas.supervisorSeg;
}

/** El preset que corresponde a estos valores. El nombre guardado NO manda: si
 *  alguien tocó un número, es Personalizado aunque la fila diga otra cosa. */
export function detectarPreset(r: ReglasCowork): Preset {
  for (const [nombre, preset] of Object.entries(PRESETS) as [Exclude<Preset, "personalizado">, ReglasCowork][]) {
    if (mismasReglas(r, preset)) return nombre;
  }
  return "personalizado";
}

/**
 * Convierte lo que venga de la base (o de un formulario) en reglas completas y
 * sanas. TOLERANTE a propósito: una clave que falta toma el estándar, un número
 * fuera de rango se acota, un preset desconocido se recalcula. Una fila vieja
 * o rota nunca puede dejar a una sesión sin reglas — sin reglas sería sin
 * supervisión, y eso es lo peor que puede pasar en silencio.
 *
 * `null`/`undefined` = la sesión no tiene reglas propias = ESTÁNDAR.
 */
export function normalizarReglas(raw: unknown): ReglasCowork {
  if (raw === null || raw === undefined) return REGLAS_ESTANDAR;
  const r = (typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sinPreset: ReglasCowork = {
    preset: "personalizado",
    camara: normalizarAviso(r.camara, REGLAS_ESTANDAR.camara),
    encuadre: normalizarAviso(r.encuadre, REGLAS_ESTANDAR.encuadre),
    pantalla: normalizarAviso(r.pantalla, REGLAS_ESTANDAR.pantalla),
    pausas: normalizarPausas(r.pausas, REGLAS_ESTANDAR.pausas),
  };
  return { ...sinPreset, preset: detectarPreset(sinPreset) };
}

/** ¿Es exactamente lo que Cowork hace por defecto? (para no marcar el punto
 *  de "personalizado" en el botón) */
export function sonEstandar(r: ReglasCowork): boolean {
  return mismasReglas(r, REGLAS_ESTANDAR);
}

/** Lo que se guarda en la base. El estándar se guarda como null: así una
 *  sesión sin reglas propias sigue al estándar aunque este cambie mañana. */
export function paraGuardar(r: ReglasCowork): ReglasCowork | null {
  return sonEstandar(r) ? null : { ...r, preset: detectarPreset(r) };
}

/** Qué regla aplica a lo que vio el detector de encuadre. */
export function reglaDeEstado(r: ReglasCowork, estado: string | null | undefined): ReglaAviso | null {
  if (estado === "cam_off") return r.camara;
  if (estado === "no_face" || estado === "too_small" || estado === "too_dark") return r.encuadre;
  return null;   // ok, unavailable, nada
}

/** Qué regla aplica a cada categoría del registro de llamados. */
export function reglaDeLlamado(r: ReglasCowork, kind: "camara" | "encuadre" | "luz" | "pantalla"): ReglaAviso {
  if (kind === "camara") return r.camara;
  if (kind === "pantalla") return r.pantalla;
  return r.encuadre;   // encuadre y luz
}

/** "1:30", "5:00", "Nunca" — para el panel y para los resúmenes. */
export function textoSegundos(seg: number | null): string {
  if (seg === null) return "Nunca";
  const m = Math.floor(seg / 60), s = seg % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── El store fuera de React ──────────────────────────────────────────────────

let vigentes: ReglasCowork = REGLAS_ESTANDAR;

/** Lo llama la página de Cowork cada vez que cambia la sesión. `null` = estándar. */
export function fijarReglas(r: ReglasCowork | null | undefined): void {
  vigentes = r ?? REGLAS_ESTANDAR;
}

/** Lo consultan los avisos en cada tic. Nunca devuelve algo incompleto. */
export function reglasActuales(): ReglasCowork {
  return vigentes;
}
