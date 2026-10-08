// REACCIONES CON EMOJI, como las de Gmail (Keila, 08/10/2026).
//
// Una reacción es un correo corto que responde al mensaje con un emoji: Gmail
// (y Maven) lo muestran como reacción debajo del mensaje; los demás clientes
// ven el texto de respaldo («Keila reaccionó con 👍»). El formato lo arma
// buildMessage (`reaccion`); acá están las reglas de a quién y cuándo.
//
// Formato y límites: developers.google.com/workspace/gmail/reactions/format.
// Suelto —sin IMAP ni Supabase— para poder probarlo sin red.

/** Un solo emoji, como lo exige Google (UTS #51, con tonos de piel y uniones):
 *  UN grafema que sea pictográfico (o una bandera / un keycap). «👍👍», «ok» o
 *  un emoji con texto pegado no son una reacción válida, y Gmail la mostraría
 *  como un correo común. */
export function esUnEmoji(s: unknown): s is string {
  if (typeof s !== "string" || !s || s.length > 32) return false;
  const grafemas = [...new Intl.Segmenter("es", { granularity: "grapheme" }).segment(s)];
  if (grafemas.length !== 1) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]️?⃣/u.test(s);
}

/** Las direcciones de un campo como lo guarda la caché (`"Ana" <ana@x.co>, b@y.co`). */
export function direccionesDe(campo: string | null | undefined): string[] {
  const vistas = new Set<string>();
  for (const m of (campo ?? "").matchAll(/[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+/g)) {
    vistas.add(m[0].toLowerCase());
  }
  return [...vistas];
}

/** Tope de Google: con más de 20 personas distintas en Para y Cc, no se reacciona. */
export const TOPE_DESTINATARIOS = 20;
/** Tope de Google: más de 20 reacciones de la misma persona a un mensaje, no. */
export const TOPE_REACCIONES = 20;

export type Destinatarios =
  | { ok: true; to: string[]; cc: string[] }
  | { ok: false; motivo: "muchos" | "no_estas" | "nadie" };

/** A quién va: como «Responder a todos» (el remitente y los de Para en Para,
 *  los de Cc en Cc), sin uno mismo.
 *
 *  ⚠️ Solo si quien reacciona estaba en Para o Cc (o lo mandó): con copia
 *  oculta, reaccionar delataría que lo recibió. Lo recomienda Google. */
export function destinatariosDeLaReaccion(
  objetivo: { from: string; to: string; cc: string },
  yo: string,
): Destinatarios {
  const mia = yo.toLowerCase();
  const remitente = direccionesDe(objetivo.from);
  const para = direccionesDe(objetivo.to);
  const copia = direccionesDe(objetivo.cc);
  const todos = new Set([...remitente, ...para, ...copia]);
  todos.delete(mia);
  if (todos.size > TOPE_DESTINATARIOS) return { ok: false, motivo: "muchos" };
  if (!remitente.includes(mia) && !para.includes(mia) && !copia.includes(mia)) {
    return { ok: false, motivo: "no_estas" };
  }
  const to = [...new Set([...remitente, ...para])].filter((d) => d !== mia);
  const cc = copia.filter((d) => d !== mia && !to.includes(d));
  if (to.length === 0 && cc.length === 0) return { ok: false, motivo: "nadie" };
  // Sin nadie en Para (todo en copia), el primero de la copia pasa a Para.
  if (to.length === 0) return { ok: true, to: [cc[0]], cc: cc.slice(1) };
  return { ok: true, to, cc };
}

/** «Re: …» una sola vez, como una respuesta. */
export function asuntoDeLaReaccion(asunto: string | null | undefined): string {
  const a = (asunto ?? "").trim() || "(sin asunto)";
  return /^re:/i.test(a) ? a : `Re: ${a}`;
}

/** References: la cadena del original más el original, para que caiga en el hilo. */
export function referenciasDeLaReaccion(refs: string[] | null | undefined, messageId: string): string {
  const cadena = (refs ?? []).filter((r) => r && r !== messageId);
  return [...cadena, messageId].join(" ");
}

/** El texto de respaldo, para quien no ve reacciones. Va DENTRO del correo que
 *  lee otra persona: en español, como el encabezado de una cita. */
export function respaldoDeLaReaccion(nombre: string, emoji: string): { text: string; html: string } {
  const quien = nombre.trim() || "Alguien";
  const esc = quien.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return {
    text: `${quien} reaccionó con ${emoji}`,
    html: `<p>${esc} reaccionó con ${emoji}</p>`,
  };
}
