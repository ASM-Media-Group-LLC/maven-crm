// Tiempo trabajado en Cowork — la regla que decide si el reloj CORRE o está
// DETENIDO en un instante dado. Es puro (sin Deno ni navegador) para que la
// edge `cowork-session` y los tests del frontend usen exactamente la misma.
//
// Decisión de Jhon (07/09/2026), preparando el reemplazo de Hubstaff:
//   · Cuenta el tiempo dentro de una sala de Cowork con cámara encendida Y
//     pantalla compartida, las dos a la vez.
//   · Se detiene si se apaga la cámara, si deja de compartir pantalla, si está
//     en pausa (baño/break), o si la cámara está prendida pero NO HAY NADIE
//     delante ("fuera de cámara" = el detector no registra a nadie, literal).
//   · Mal encuadre, muy lejos, poca luz NO detienen el reloj: para eso están
//     las alertas de siempre con las reglas del supervisor.
//   · Tolerancia: agacharse tres segundos no descuenta. La ausencia tiene que
//     durar UMBRAL_FUERA_DE_CAMARA_MS para que el reloj se detenga.

export type EstadoTiempo = "activo" | "pausa" | "sin_camara" | "sin_pantalla" | "fuera_de_camara" | "meet";

export const ESTADOS_TIEMPO: readonly EstadoTiempo[] = ["activo", "pausa", "sin_camara", "sin_pantalla", "fuera_de_camara", "meet"];

/** Cuánto tiene que durar el "no hay nadie" para detener el reloj. */
export const UMBRAL_FUERA_DE_CAMARA_MS = 60_000;
/** Cada cuánto late el cliente mientras está en la sala. */
export const INTERVALO_LATIDO_MS = 30_000;
/** Sin latidos durante este tiempo el segmento abierto se da por terminado en
 *  el último latido visto: una pestaña que se cerró sin avisar no suma. */
export const LATIDO_VENCIDO_MS = 90_000;

export interface Latido {
  camOn: boolean;
  screenShareOn: boolean;
  /** Estado del detector de la propia cámara: "ok" | "no_face" | "too_small" | "too_dark". */
  faceState?: string | null;
  /** Epoch ms desde que el detector está en `faceState`. */
  faceSince?: number | null;
  onBreak?: boolean;
  /** Llevado a un meet grupal por su supervisor: cuenta como trabajo aunque
   *  no comparta pantalla (en el meet no se comparte). La pausa manda igual. */
  enMeet?: boolean;
}

export interface Veredicto {
  estado: EstadoTiempo;
  /** Sub-dato útil para depurar: el faceState cuando aplica. */
  detalle: string | null;
}

/** Qué exige la sesión. El reloj pide lo mismo que las alertas del supervisor:
 *  si apagó la pantalla para su equipo (managers), el reloj no se detiene por
 *  pantalla; si apagó la cámara, tampoco por cámara ni por "fuera de cámara"
 *  (sin cámara no hay detector). Decisión de Jhon (07/09): depende de lo que
 *  tenga configurado el supervisor. */
export interface Exigencias {
  camara: boolean;
  pantalla: boolean;
}

export const EXIGE_TODO: Exigencias = { camara: true, pantalla: true };

/** ¿Corre el reloj en este instante? Prioridad: pausa > sin cámara > sin
 *  pantalla > fuera de cámara > activo — cada una solo si la sesión la exige. */
export function estadoDeTiempo(l: Latido, ahora: number, umbralFueraMs = UMBRAL_FUERA_DE_CAMARA_MS, exige: Exigencias = EXIGE_TODO): Veredicto {
  if (l.onBreak) return { estado: "pausa", detalle: null };
  if (l.enMeet) return { estado: "meet", detalle: null };
  if (exige.camara && !l.camOn) return { estado: "sin_camara", detalle: null };
  if (exige.pantalla && !l.screenShareOn) return { estado: "sin_pantalla", detalle: null };
  // "Fuera de cámara" solo tiene sentido si la cámara se exige y está encendida.
  if (exige.camara && l.camOn && l.faceState === "no_face") {
    // Un faceSince en el futuro (reloj del cliente adelantado) cuenta como "recién".
    const desde = typeof l.faceSince === "number" && l.faceSince <= ahora ? l.faceSince : ahora;
    if (ahora - desde >= umbralFueraMs) return { estado: "fuera_de_camara", detalle: "no_face" };
  }
  return { estado: "activo", detalle: l.faceState ?? null };
}

/** ¿El reloj corre en este estado? */
export function cuentaComoTrabajo(estado: EstadoTiempo): boolean {
  return estado === "activo" || estado === "meet";
}
