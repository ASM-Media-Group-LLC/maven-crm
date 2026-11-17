// La regla del reloj de Cowork, DEL LADO DEL FRONTEND.
//
// ⚠️ ES UNA COPIA de supabase/functions/_shared/cowork-tiempo.ts, y tiene que
// serlo: el Dockerfile del frontend construye con un contexto que EXCLUYE la
// carpeta supabase/ (.dockerignore), así que un import
// "../../../supabase/functions/..." compila en tu máquina y ROMPE el build de
// Dokploy. Pasó el 07/09/2026: seis PR mergeados y ninguno llegó a producción
// en tres horas hasta que se vio que el build fallaba por esto.
//
// El test `coworkTiempoEstado.test.ts` compara las dos implementaciones sobre
// la misma matriz de casos: si alguien cambia una y no la otra, falla.
// La lógica en sí está explicada en el archivo de la edge.

export type EstadoTiempo =
  | "activo" | "pausa" | "sin_camara" | "sin_pantalla" | "fuera_de_camara" | "meet"
  | "sin_conexion" | "sin_conexion_larga";

export const ESTADOS_TIEMPO: readonly EstadoTiempo[] = [
  "activo", "pausa", "sin_camara", "sin_pantalla", "fuera_de_camara", "meet",
  "sin_conexion", "sin_conexion_larga",
];

/** Cómo está la persona respecto de la sala de LiveKit. Ver la edge. */
export type ConexionSala = "conectada" | "reconectando" | "desconectada" | "reemplazada" | "dormido";

export const CONEXIONES_SALA: readonly ConexionSala[] = ["conectada", "reconectando", "desconectada", "reemplazada", "dormido"];

export const TOPE_SIN_CONEXION_MS = 10 * 60_000;
export const VENTANA_SIN_CONEXION_MS = 60 * 60_000;
export const NO_COBRABA_DESDE_MS = 60_000;

export const UMBRAL_FUERA_DE_CAMARA_MS = 60_000;
export const INTERVALO_LATIDO_MS = 30_000;
export const LATIDO_VENCIDO_MS = 90_000;

export interface Latido {
  camOn: boolean;
  screenShareOn: boolean;
  faceState?: string | null;
  faceSince?: number | null;
  onBreak?: boolean;
  /** Llevado a un meet grupal por su supervisor: cuenta como trabajo aunque
   *  no comparta pantalla (en el meet no se comparte). La pausa manda igual. */
  enMeet?: boolean;
  /** Ausente o null = no se sabe: se aplica la regla de siempre. */
  conexionSala?: ConexionSala | null;
}

export interface Veredicto {
  estado: EstadoTiempo;
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

/** ¿Corre el reloj en este instante? Prioridad: pausa > meet > sin conexión >
 *  sin cámara > sin pantalla > fuera de cámara > activo — cada una solo si la
 *  sesión la exige. `caidaPagada` lo decide el servidor (caidaSePaga). */
export function estadoDeTiempo(
  l: Latido, ahora: number, umbralFueraMs = UMBRAL_FUERA_DE_CAMARA_MS, exige: Exigencias = EXIGE_TODO,
  caidaPagada = true,
): Veredicto {
  if (l.onBreak) return { estado: "pausa", detalle: null };
  if (l.enMeet) return { estado: "meet", detalle: null };
  // El equipo se durmió (Alvaro, 17/11/2026; frontend/src/lib/equipoDormido.ts):
  // no es una caída de la sala ni se paga, exija lo que exija la sesión. Un
  // equipo dormido que despierta un minuto latía «desconectada» y se le pagaba
  // como caída.
  if (l.conexionSala === "dormido") return { estado: "sin_conexion_larga", detalle: "equipo_dormido" };
  if ((exige.camara || exige.pantalla) && l.conexionSala === "desconectada") {
    return { estado: caidaPagada ? "sin_conexion" : "sin_conexion_larga", detalle: null };
  }
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

/** LA regla de qué se paga. El resto del frontend le pregunta a esta función:
 *  no repetir la lista a mano (llegó a estar copiada en cinco lugares). */
export function cuentaComoTrabajo(estado: EstadoTiempo): boolean {
  return estado === "activo" || estado === "meet" || estado === "sin_conexion";
}
