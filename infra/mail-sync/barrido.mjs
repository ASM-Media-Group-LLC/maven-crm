// Decide si una carpeta se ABRE (SELECT + FETCH) o se salta en un barrido.
//
// Antes cada barrido abría TODAS las carpetas de TODAS las casillas y traía las
// banderas de los últimos 50 mensajes, hubiera pasado algo o no. Con 58
// casillas eso es lo que Zoho castiga (tarpit): el IMAP se arrastra y hasta el
// SMTP del envío se pone lento (reporte del equipo, 10/09: "abrir el correo
// en llamada relentiza todo" y un correo de prueba que no llegó).
//
// STATUS es un solo comando barato: cuántos mensajes hay, cuál es el próximo
// UID, cuántos no leídos y la generación (uidvalidity). Si esos cuatro números
// no cambiaron, adentro no cambió nada que nos importe: no hay correo nuevo
// (UIDNEXT), nadie leyó ni des-leyó (UNSEEN), no se borró nada (MESSAGES).
//
// Puro y sin IMAP para poder probarlo (test.mjs).

/** Huella de un STATUS. null si el servidor no contestó (imapflow devuelve
 *  false cuando no pudo) — en ese caso se abre como siempre. */
export function huellaDeStatus(status) {
  if (!status || typeof status !== "object") return null;
  const n = (v) => (v === undefined || v === null ? "-" : String(v));
  return `${n(status.uidValidity)}|${n(status.uidNext)}|${n(status.messages)}|${n(status.unseen)}`;
}

/**
 * @param {object} args
 * @param {object|false|null} args.status  respuesta de client.status(...)
 * @param {string|null} args.huellaPrevia  huella guardada del barrido anterior
 * @param {number} args.ultimaReconciliacion  epoch ms de la última reconciliación (0 = nunca)
 * @param {number} args.ahora  epoch ms
 * @param {number} args.reconciliarMs  piso: pasado este tiempo se abre igual
 * @returns {{ abrir: boolean, motivo: "sin-status"|"primera"|"cambio"|"reconciliar"|"igual", huella: string|null }}
 */
export function decidirSiAbrir({ status, huellaPrevia, ultimaReconciliacion, ahora, reconciliarMs }) {
  const huella = huellaDeStatus(status);
  // La optimización nunca puede costar un correo: sin STATUS, se abre.
  if (!huella) return { abrir: true, motivo: "sin-status", huella: null };
  if (!huellaPrevia) return { abrir: true, motivo: "primera", huella };
  if (huellaPrevia !== huella) return { abrir: true, motivo: "cambio", huella };
  // Red de seguridad: aunque el STATUS diga "igual", cada tanto se abre para
  // reconciliar banderas y conteos (por si una escritura anterior se perdió).
  if (ahora - (ultimaReconciliacion ?? 0) >= reconciliarMs) return { abrir: true, motivo: "reconciliar", huella };
  return { abrir: false, motivo: "igual", huella };
}
