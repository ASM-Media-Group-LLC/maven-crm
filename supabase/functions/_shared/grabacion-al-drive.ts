// Las reglas de la copia de una grabación al Drive (edge grabaciones-al-drive).
// Sin red ni base: se prueban desde frontend/src/test/grabaciones.
//
// Dónde queda: en el Drive de QUIEN GRABÓ, como Google Meet («Meet Recordings»):
//   Grabaciones / <año-mes> / <nombre de la sala> <fecha>.mp4
// y compartida como lectura con quien estuvo en la llamada y con quien la
// recibió al pararla. Nada de unidad de empresa: una unidad la ven entera los
// de «acceso total» del Drive, y una reunión de RR. HH. no tiene por qué.

/** La zona en la que se nombran las carpetas y los archivos (la agencia trabaja en Colombia). */
export const ZONA = "America/Bogota";

export const CARPETA_RAIZ = "Grabaciones";

/** Lo que pide el NAS por pedido (y lo que usa el Drive): 32 MB. */
export const TAMANO_PARTE = 32 * 1024 * 1024;

/** Intentos antes de rendirse con una grabación (el cron pasa cada 2 min: ~2 h). */
export const MAX_INTENTOS = 60;

function partesDeFecha(iso: string, zona = ZONA) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const v = (t: string) => f.find((p) => p.type === t)?.value ?? "00";
  return { a: v("year"), m: v("month"), d: v("day"), h: v("hour"), min: v("minute") };
}

/** «2026-11» — la carpeta del mes en que empezó la grabación. */
export function carpetaDelMes(iniciada: string, zona = ZONA): string {
  const p = partesDeFecha(iniciada, zona);
  return `${p.a}-${p.m}`;
}

/** Un nombre que el Drive acepta: sin «/» ni «\», sin caracteres de control,
 *  1 a 255 caracteres (el CHECK de drive_items). */
export function limpiarNombre(s: string): string {
  return s.replace(/[\\/\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

/** «PLUS 3 2026-11-17 16.05.mp4». Sin «:» en la hora: Windows no deja bajar un
 *  archivo con dos puntos en el nombre. Sin título, el nombre de la sala. */
export function nombreDelArchivo(titulo: string | null | undefined, sala: string, iniciada: string, zona = ZONA): string {
  const p = partesDeFecha(iniciada, zona);
  const base = limpiarNombre(titulo ?? "") || limpiarNombre(sala) || "Reunión";
  return `${base.slice(0, 200)} ${p.a}-${p.m}-${p.d} ${p.h}.${p.min}.mp4`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** El usuario de Maven detrás de una identidad de LiveKit: `<uuid>`,
 *  `<uuid>_<sufijo>` (livekit-token) o `<uuid>__<algo>` (cowork-session). Los
 *  invitados y el grabador (EG_…) no son de Maven: null. */
export function usuarioDeIdentidad(identidad: string | null | undefined): string | null {
  if (typeof identidad !== "string") return null;
  const m = UUID.exec(identidad);
  if (!m) return null;
  const resto = identidad.slice(36);
  if (resto !== "" && !resto.startsWith("_")) return null;
  return m[0].toLowerCase();
}

/** Con quién se comparte la copia: participantes + destinatarios, sin repetir
 *  y sin el dueño (el Drive no deja compartirle a uno su propio archivo). */
export function conQuienCompartir(dueno: string, participantes: string[], destinatarios: string[]): string[] {
  return [...new Set([...participantes, ...destinatarios].map((u) => u.toLowerCase()))]
    .filter((u) => u !== dueno.toLowerCase());
}

/** Cuántas partes de 32 MB tiene un archivo (0 = va de un solo PUT). */
export function partesDe(size: number): number {
  if (!Number.isFinite(size) || size <= 0) throw new Error("tamaño inválido");
  return size <= TAMANO_PARTE ? 0 : Math.ceil(size / TAMANO_PARTE);
}

/** El rango de bytes (inclusive) de la parte i. */
export function rangoDeParte(i: number, size: number): { desde: number; hasta: number } {
  const desde = i * TAMANO_PARTE;
  return { desde, hasta: Math.min(desde + TAMANO_PARTE, size) - 1 };
}

// ── Cuánto queda en el Drive (Alvaro, 17/11/2026) ───────────────────────────
// La copia del Drive dura 30 días desde que se copia (también las viejas: los
// 30 días cuentan desde la copia, no desde la grabación). Quien grabó puede
// pedir 30 días más las veces que quiera; 3 días antes de vencer se le avisa.
// La extensión la hace la base (grabacion_drive_extender) con la misma suma.

export const DIAS_EN_DRIVE = 30;
export const AVISO_ANTES_DIAS = 3;
const DIA_MS = 24 * 3600 * 1000;

/** Hasta cuándo queda en el Drive una copia hecha en `desde`. */
export function venceEnElDrive(desde: Date | string | number): string {
  return new Date(new Date(desde).getTime() + DIAS_EN_DRIVE * DIA_MS).toISOString();
}

/** ¿Ya toca avisar que vence? (dentro de los últimos AVISO_ANTES_DIAS días). */
export function tocaAvisarVencimiento(vence: string, ahora: number = Date.now()): boolean {
  const t = new Date(vence).getTime();
  return t > ahora && t - ahora <= AVISO_ANTES_DIAS * DIA_MS;
}

/** «17 de dic de 2026» en hora de Colombia, para los avisos. */
export function fechaLegible(iso: string, zona = ZONA): string {
  return new Intl.DateTimeFormat("es-CO", { timeZone: zona, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

/** El enlace del aviso: abre /grabaciones con la pregunta de extender. */
export const enlaceParaExtender = (recordingId: string) => `/grabaciones?extender=${recordingId}`;

/** Los textos de los dos avisos (campana y correo). */
export function textoDelAviso(clase: "copiada" | "por_vencer", archivo: string, vence: string): { titulo: string; mensaje: string } {
  const fecha = fechaLegible(vence);
  return clase === "copiada"
    ? {
      titulo: "Tu grabación quedó en el Drive por 30 días",
      mensaje: `«${archivo}» está en tu Drive (carpeta Grabaciones) hasta el ${fecha}. Si la necesitas más tiempo, toca «Guardar 30 días más».`,
    }
    : {
      titulo: "Tu grabación se borra del Drive pronto",
      mensaje: `«${archivo}» se borra del Drive el ${fecha}. Toca «Guardar 30 días más» si todavía la necesitas.`,
    };
}
