// Borradores por conversación (estilo WhatsApp): lo que estabas escribiendo en
// un chat sobrevive a cambiar de chat y a recargar la página. Se guarda en
// localStorage por usuario+conversación; el envío lo limpia.
//
// Todo va en try/catch: en modo privado / cuota llena, escribir a localStorage
// tira — y perder el borrador es aceptable, romper el composer no.

const key = (userId: string, conversationId: string) =>
  `mvn_chat_draft_${userId}_${conversationId}`;

export function getDraft(userId: string | undefined, conversationId: string): string {
  if (!userId) return "";
  try {
    return localStorage.getItem(key(userId, conversationId)) || "";
  } catch {
    return "";
  }
}

export function setDraft(userId: string | undefined, conversationId: string, text: string) {
  if (!userId) return;
  try {
    if (text.trim()) localStorage.setItem(key(userId, conversationId), text);
    else localStorage.removeItem(key(userId, conversationId));
  } catch {
    /* sin persistencia, sin drama */
  }
}

export function clearDraft(userId: string | undefined, conversationId: string) {
  if (!userId) return;
  try {
    localStorage.removeItem(key(userId, conversationId));
  } catch {
    /* idem */
  }
}
