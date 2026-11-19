// CÁMARA QUE SE CAE O NO PRENDE (Alvaro, 19/11/2026: «las cámaras se apagan
// solas, después la quieren encender y no deja»).
//
// LiveKit ya intenta reabrir la cámara cuando la pista se cae; si no puede, la
// deja SILENCIADA sin decir nada, y el siguiente clic en «prender» falla igual
// (casi siempre porque otro programa la tiene: Zoom, WhatsApp, otra pestaña de
// Maven; en Windows una cámara la usa un solo programa a la vez). Aquí se
// traduce el error del navegador a una causa que la persona entiende, y se
// decide cuándo el vigilante la vuelve a pedir sola.

export type CausaFalloCamara = "ocupada" | "permiso" | "sin_camara" | "otro";

/** El error de getUserMedia (o de LiveKit) → la causa. */
export function causaDeFalloDeCamara(err: unknown): CausaFalloCamara {
  const nombre = (err as { name?: unknown } | null)?.name;
  const msg = String((err as { message?: unknown } | null)?.message ?? err ?? "").toLowerCase();
  if (nombre === "NotReadableError" || nombre === "TrackStartError" || nombre === "AbortError"
    || msg.includes("could not start video source") || msg.includes("device in use")) return "ocupada";
  if (nombre === "NotAllowedError" || nombre === "PermissionDeniedError" || nombre === "SecurityError"
    || msg.includes("permission")) return "permiso";
  if (nombre === "NotFoundError" || nombre === "DevicesNotFoundError" || nombre === "OverconstrainedError"
    || nombre === "ConstraintNotSatisfiedError" || msg.includes("requested device not found")) return "sin_camara";
  return "otro";
}

/** Cada cuánto el vigilante mira la cámara, y cuántas vueltas seguidas tiene
 *  que estar caída antes de repararla (un cambio de perfil la republica). */
export const VIGILAR_CAMARA_MS = 5_000;
export const VUELTAS_ANTES_DE_REPARAR = 2;
/** Reintentos seguidos antes de avisar; después se sigue probando más despacio
 *  (cada 30 s), por si la persona cerró el otro programa. */
export const REINTENTOS_ANTES_DE_AVISAR = 3;
export const REINTENTO_LENTO_MS = 30_000;

export interface EstadoVigilanteCamara {
  caidaSeguidas: number;
  intentos: number;
  ultimoIntento: number;
}

export const VIGILANTE_CAMARA_INICIAL: EstadoVigilanteCamara = { caidaSeguidas: 0, intentos: 0, ultimoIntento: 0 };

/** ¿Toca intentar prenderla ahora? Solo si la persona la quiere prendida y
 *  está caída. Puro, para probarlo sin cámara. */
export function decidirRepararCamara(
  s: { conectado: boolean; quiere: boolean; ocupado: boolean; caida: boolean },
  m: EstadoVigilanteCamara,
  ahora: number,
): { reparar: boolean; memoria: EstadoVigilanteCamara } {
  if (!s.conectado || !s.quiere || !s.caida) return { reparar: false, memoria: VIGILANTE_CAMARA_INICIAL };
  const caidaSeguidas = m.caidaSeguidas + 1;
  if (s.ocupado || caidaSeguidas < VUELTAS_ANTES_DE_REPARAR) return { reparar: false, memoria: { ...m, caidaSeguidas } };
  const espera = m.intentos < REINTENTOS_ANTES_DE_AVISAR ? 0 : REINTENTO_LENTO_MS;
  if (ahora - m.ultimoIntento < espera) return { reparar: false, memoria: { ...m, caidaSeguidas } };
  return { reparar: true, memoria: { caidaSeguidas, intentos: m.intentos + 1, ultimoIntento: ahora } };
}
