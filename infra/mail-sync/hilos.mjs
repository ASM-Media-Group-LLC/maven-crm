// Una RESPUESTA a una conversación que ya se etiquetó hereda sus etiquetas, y
// si la conversación ya se había sacado de Recibidos, se archiva con ella.
//
// Keila (02/10): «cuando le asigno una carpeta a un mensaje todo el hilo
// debería irse a esa carpeta por defecto (entra al buzón de recibidos pero se
// ve en ambos)». Sus datos lo confirmaban: etiquetaba y archivaba la charla,
// llegaba la respuesta a Recibidos SIN la etiqueta y la volvía a etiquetar a
// mano al día siguiente (tres veces la misma solicitud de permiso).
//
// Puro y sin IMAP para poder probarlo (test.mjs). Quién llama: index.mjs, al
// guardar lo NUEVO de Recibidos (nunca en la primera carga de una casilla).

/** Los Message-ID a los que responde: In-Reply-To y References, sin repetir.
 *  Con tope: un References con cientos de ids es raro pero existe. */
export function ancestrosDe({ inReplyTo, refs }, tope = 50) {
  const todos = [inReplyTo, ...(Array.isArray(refs) ? refs : refs ? [refs] : [])]
    .filter((x) => typeof x === "string" && x.trim())
    .map((x) => x.trim());
  return [...new Set(todos)].slice(-tope);
}

/** Cuánto vale «nuevo»: una respuesta de hace semanas que recién se baja (la
 *  casilla estuvo caída, o la movieron de vuelta a Recibidos) no se archiva
 *  sola. Solo se etiqueta. */
export const DIAS_PARA_ARCHIVAR = 7;

/**
 * @param {object} p
 * @param {string[]} p.etiquetasDelHilo   label_id de los mensajes a los que responde
 * @param {boolean}  p.yaTieneEtiquetas   el mensaje nuevo ya tiene alguna (alguien decidió)
 * @param {boolean}  p.etiquetadosEnRecibidos  algún mensaje etiquetado del hilo sigue en Recibidos
 * @param {string|null} p.fecha           fecha del mensaje nuevo (ISO)
 * @param {number}   p.ahora
 * @returns {{ etiquetas: string[], archivar: boolean }}
 */
export function decidirHerencia({ etiquetasDelHilo, yaTieneEtiquetas, etiquetadosEnRecibidos, fecha, ahora }) {
  const nada = { etiquetas: [], archivar: false };
  // Si ya tiene etiquetas, alguien ya lo ordenó (o ya se heredó y la persona lo
  // devolvió a Recibidos a propósito): no se toca, ni se vuelve a archivar.
  if (yaTieneEtiquetas) return nada;
  const etiquetas = [...new Set((etiquetasDelHilo ?? []).filter(Boolean))];
  if (!etiquetas.length) return nada;
  const t = Date.parse(fecha ?? "");
  const reciente = Number.isFinite(t) && ahora - t <= DIAS_PARA_ARCHIVAR * 24 * 3600_000;
  // Se archiva SOLO si la charla ya estaba fuera de Recibidos: quien etiquetó
  // sin archivar quiere seguir viéndola en la bandeja, y ahí se queda.
  return { etiquetas, archivar: reciente && !etiquetadosEnRecibidos };
}
