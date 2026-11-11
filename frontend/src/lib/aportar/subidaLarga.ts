// VIDEOS LARGOS Y PESADOS DE LAS MODELOS (Alvaro, 11/11/2026).
//
// Lo que se vio en los datos: un video de 649 MB rebotó 9 veces (VEROODLE),
// otro de 924 MB 10 veces (BELIAL), y con 1 Mbps de subida un video de 1 GB
// tarda más de 2 horas. En el iPhone la subida se pausa si se bloquea la
// pantalla o se cambia de app. Alvaro eligió: aviso claro + que retome sola, y
// una "caja negra" de cada intento con aviso a quien creó el link.
//
// Acá viven las reglas puras (con tests en test/aportar/subidaLarga.test.ts):
// cuánto falta, cuándo se considera pausada, qué falla se reintenta sola, y de
// dónde sale la ruta REAL del archivo cuando la subida se retoma.

/** Sin avance por este tiempo, la subida se muestra "en pausa". */
export const PAUSA_MS = 30_000;
/** Cada cuánto se manda el progreso a la caja negra (no en cada parte de 2 MB). */
export const REPORTE_MS = 30_000;
/** Cuántas veces se retoma sola antes de dejar el botón de reintentar. */
export const REINTENTOS_SOLOS = 40;
/** Espera mínima antes de retomar sola (que la red respire). */
export const ESPERA_RETOMAR_MS = 5_000;

/** Velocidad en kbps, suavizada para que el "faltan" no salte a cada parte. */
export function velocidadSuavizada(prevKbps: number | null, bytes: number, ms: number): number | null {
  if (bytes <= 0 || ms <= 0) return prevKbps;
  const ahora = (bytes * 8) / ms; // bits por ms = kbps
  if (prevKbps === null) return ahora;
  return prevKbps * 0.8 + ahora * 0.2;
}

/** Minutos que faltan (redondeados hacia arriba, mínimo 1). null si aún no se sabe. */
export function minutosRestantes(bytesRestantes: number, kbps: number | null): number | null {
  if (kbps === null || kbps <= 0) return null;
  if (bytesRestantes <= 0) return 0;
  const segundos = (bytesRestantes * 8) / (kbps * 1000);
  return Math.max(1, Math.ceil(segundos / 60));
}

/** Tamaño legible: 389 MB, 1,2 GB. */
export function pesoLegible(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** ¿Se quedó quieta? (sin avance desde hace PAUSA_MS). */
export function estaPausada(ultimoAvance: number, ahora: number): boolean {
  return ahora - ultimoAvance >= PAUSA_MS;
}

/** ¿Toca mandar el progreso a la caja negra? */
export function tocaReportar(ultimoReporte: number | null, ahora: number): boolean {
  return ultimoReporte === null || ahora - ultimoReporte >= REPORTE_MS;
}

/** Una falla de red/servidor se retoma sola; un rechazo (4xx: archivo muy grande,
 *  link cerrado) no, porque repetir daría lo mismo. */
export function seRetomaSola(status: number | null | undefined, reintentosHechos: number): boolean {
  if (reintentosHechos >= REINTENTOS_SOLOS) return false;
  if (status === null || status === undefined || status === 0) return true;
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

/** La ruta real del objeto según la URL de TUS de Supabase. El último tramo de
 *  la URL es base64url de «bucket/ruta/version». Si no se puede leer, null. */
export function rutaDeUrlTus(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const id = url.split("?")[0].split("/").filter(Boolean).pop();
  if (!id) return null;
  try {
    const b64 = id.replace(/-/g, "+").replace(/_/g, "/");
    const texto = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const partes = texto.split("/");
    if (partes.length < 3 || partes[0] !== bucket) return null;
    return partes.slice(1, -1).join("/") || null;
  } catch {
    return null;
  }
}

/** ¿Esta subida guardada se puede retomar para este link? Solo si va al mismo
 *  bucket y a la carpeta del mismo token (nunca se mezclan links). */
export function sePuedeRetomar(metadata: Record<string, string> | null | undefined, bucket: string, prefijo: string): boolean {
  return !!metadata && metadata.bucketName === bucket && typeof metadata.objectName === "string"
    && metadata.objectName.startsWith(prefijo);
}
