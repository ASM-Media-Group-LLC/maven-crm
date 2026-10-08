// REACCIONES CON EMOJI (como Gmail; Keila, 08/10/2026).
//
// Un correo que trae una parte `text/vnd.google.email-reaction+json` válida es
// una REACCIÓN al mensaje de su In-Reply-To: Maven la guarda con su emoji
// (`mail_messages.reaccion`) y la muestra como chip debajo de ese mensaje, no
// como un correo más. mailparser entrega esa parte como un «adjunto» con el
// JSON adentro.
//
// Las reglas son las de Google (developers.google.com/workspace/gmail/reactions/format):
// `version` NÚMERO 1, UN emoji, sin Content-Disposition attachment y con
// In-Reply-To. Si algo falla, es un correo común (como hace Gmail).

export const TIPO_REACCION = "text/vnd.google.email-reaction+json";

function esUnEmoji(s) {
  if (typeof s !== "string" || !s || s.length > 32) return false;
  const grafemas = [...new Intl.Segmenter("es", { granularity: "grapheme" }).segment(s)];
  if (grafemas.length !== 1) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]️?⃣/u.test(s);
}

/** El emoji si el correo parseado es una reacción válida; si no, null. */
export function reaccionDe(parsed) {
  if (!parsed?.inReplyTo) return null;
  const parte = (parsed.attachments ?? []).find(
    (a) => (a.contentType ?? "").toLowerCase() === TIPO_REACCION && a.contentDisposition !== "attachment",
  );
  if (!parte?.content) return null;
  try {
    const json = JSON.parse(Buffer.isBuffer(parte.content) ? parte.content.toString("utf8") : String(parte.content));
    if (json?.version !== 1 || !esUnEmoji(json?.emoji)) return null;
    return json.emoji;
  } catch {
    return null;
  }
}

/** Los adjuntos de verdad: la parte de la reacción no es un archivo. */
export function sinLaReaccion(attachments) {
  return (attachments ?? []).filter((a) => (a.contentType ?? "").toLowerCase() !== TIPO_REACCION);
}
