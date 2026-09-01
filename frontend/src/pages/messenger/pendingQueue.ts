// Cola PERSISTENTE de mensajes propios no confirmados (sobreviven a recargar/cerrar la
// pestaña). Antes la cola offline vivía solo en memoria → si recargabas antes de reconectar,
// los mensajes que el toast prometía enviar se perdían. Se guarda en localStorage por usuario.

export interface PendingMessage {
  optimisticId: string;
  conversationId: string;
  content: string;
  type: string;
  fileUrl?: string;
  fileName?: string;
  replyToId?: string;
  albumId?: string;
  isThreadReply?: boolean;
  createdAt: string;
}

const key = (userId: string) => `mvn_chat_pending_${userId}`;

export function loadPending(userId: string): PendingMessage[] {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as PendingMessage[]) : [];
  } catch {
    return [];
  }
}

function savePending(userId: string, list: PendingMessage[]) {
  try {
    if (list.length === 0) localStorage.removeItem(key(userId));
    else localStorage.setItem(key(userId), JSON.stringify(list));
  } catch {
    /* quota / modo privado: no persistimos, no rompemos el envío */
  }
}

export function addPending(userId: string, m: PendingMessage) {
  const list = loadPending(userId).filter((x) => x.optimisticId !== m.optimisticId);
  list.push(m);
  savePending(userId, list);
}

export function removePending(userId: string, optimisticId: string) {
  savePending(userId, loadPending(userId).filter((x) => x.optimisticId !== optimisticId));
}

export function pendingForConversation(userId: string, conversationId: string): PendingMessage[] {
  return loadPending(userId).filter((x) => x.conversationId === conversationId);
}
