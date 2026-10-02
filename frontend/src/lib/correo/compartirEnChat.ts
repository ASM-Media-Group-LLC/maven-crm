// «Compartir en el chat»: el correo viaja a una conversación del Messenger
// como un mensaje con quién lo mandó, el asunto, la fecha, un resumen y el
// enlace para abrirlo en Maven.
//
// ⚠️ El texto que se arma acá se GUARDA y lo lee OTRA persona: no se traduce al
// idioma de quien comparte. Va siempre en español, como la cita de una
// respuesta (ver `fechaLarga` en CorreoPage). Las piezas están en el
// diccionario para que el guard de i18n no las cuente como texto suelto.

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getTranslation } from "@/lib/i18n";
import { resumenSinCita } from "@/lib/mailCita";

/** El parámetro de la URL que abre un correo: `/correo?mensaje=<Message-ID>`.
 *
 *  Va por el Message-ID y no por el id de la fila: la fila es de MI casilla,
 *  y quien recibe el enlace solo puede abrir SU copia. El Message-ID es el
 *  mismo en todas las casillas que recibieron el correo. */
export const PARAM_MENSAJE = "mensaje";

/** Largo máximo del resumen que va en el chat. */
const TOPE_RESUMEN = 280;

export interface CorreoACompartir {
  /** El remitente tal cual («Ana <ana@x.com>»). */
  de: string;
  asunto: string;
  /** ISO. */
  fecha: string;
  resumen: string;
  messageId?: string;
}

/** El enlace absoluto al correo dentro de Maven. Sin Message-ID no hay cómo
 *  encontrar la copia de otra persona: no se arma enlace. */
export function enlaceACorreo(base: string, messageId: string | undefined): string | null {
  if (!messageId) return null;
  const raiz = base.replace(/\/+$/, "");
  return `${raiz}/correo?${PARAM_MENSAJE}=${encodeURIComponent(messageId)}`;
}

/** El resumen para el chat: sin la cita del correo anterior (todos los de un
 *  hilo empezarían igual) y recortado en una palabra. */
export function resumenParaElChat(texto: string | null | undefined): string {
  const limpio = resumenSinCita((texto ?? "").replace(/\s+/g, " ").trim());
  if (limpio.length <= TOPE_RESUMEN) return limpio;
  const corte = limpio.lastIndexOf(" ", TOPE_RESUMEN);
  return `${limpio.slice(0, corte > TOPE_RESUMEN / 2 ? corte : TOPE_RESUMEN).trim()}…`;
}

const fechaDelCorreo = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es });
};

/** El mensaje que se publica en el chat. `nota` es lo que quien comparte
 *  escribe arriba (opcional). */
export function textoParaElChat(correo: CorreoACompartir, nota: string, base: string): string {
  const t = (clave: Parameters<typeof getTranslation>[0], v: string) =>
    getTranslation(clave, "es", { v });
  const lineas: string[] = [];
  const n = nota.trim();
  if (n) lineas.push(n, "");
  lineas.push(getTranslation("mail.share.msg.title", "es"));
  lineas.push(t("mail.share.msg.from", correo.de.trim()));
  lineas.push(t("mail.share.msg.subject", correo.asunto.trim() || getTranslation("mail.noSubject", "es")));
  lineas.push(t("mail.share.msg.date", fechaDelCorreo(correo.fecha)));
  const resumen = resumenParaElChat(correo.resumen);
  if (resumen) lineas.push("", `«${resumen}»`);
  const enlace = enlaceACorreo(base, correo.messageId);
  if (enlace) lineas.push("", t("mail.share.msg.open", enlace));
  return lineas.join("\n");
}
