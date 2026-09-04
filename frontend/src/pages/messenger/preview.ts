// Cómo se resume una conversación en una lista: la hora, el recorte y la
// vista previa del último mensaje.
//
// Vive acá y no dentro de ChatSidebar porque ahora hay DOS listas que tienen
// que verse igual: la barra lateral del Messenger y el desplegable de la
// campana de mensajes del topbar. Duplicar esto era garantía de que un día una
// dijera "📷 Foto" y la otra mostrara una URL.
import { ConversationWithDetails } from "./types";

export function formatTime(dateStr?: string) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 86400000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 172800000) return "Ayer";
  // "14 jul", no "14/07": el formato numérico es ambiguo (¿día/mes o
  // mes/día?) y el resto de la app ya usa el mes abreviado.
  return date.toLocaleDateString("es", { day: "numeric", month: "short" });
}

export function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/** Una línea que describe el último mensaje: "Tú: hola", "📷 Foto", "🎤 Nota de voz"… */
export function getMessagePreview(
  conversation: ConversationWithDetails,
  userId: string | undefined,
) {
  const lastMsg = conversation.lastMessage;
  if (!lastMsg) return "Sin mensajes";
  if (lastMsg.is_deleted) return "🚫 Mensaje eliminado";
  if (lastMsg.type === "system") return `ℹ️ ${lastMsg.content || ""}`;
  let body = "";
  if (lastMsg.type === "file") {
    const fn = lastMsg.file_name || "";
    if (/^voice-note/i.test(fn)) body = "🎤 Nota de voz";
    else if (/\.(webm|mp3|ogg|m4a|wav)(\?|$)/i.test(fn)) body = "🎵 Audio";
    else body = `📎 ${fn || "Archivo"}`;
  } else if (lastMsg.type === "image") body = "📷 Foto";
  else body = lastMsg.content || "";
  if (conversation.type === "group" && lastMsg.sender_id) {
    const senderName = lastMsg.sender_id === userId
      ? "Tú"
      : (conversation.participants.find((p) => p.user_id === lastMsg.sender_id)?.profile?.full_name?.split(" ")[0] || "");
    if (senderName) return `${senderName}: ${body}`;
  }
  return body;
}
