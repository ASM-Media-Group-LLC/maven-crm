// Cómo se resume una conversación en una lista: la hora, el recorte y la
// vista previa del último mensaje.
//
// Vive acá y no dentro de ChatSidebar porque ahora hay DOS listas que tienen
// que verse igual: la barra lateral del Messenger y el desplegable de la
// campana de mensajes del topbar. Duplicar esto era garantía de que un día una
// dijera "📷 Foto" y la otra mostrara una URL.
import { ConversationWithDetails } from "./types";
import { datosDeLlamada, textoDeLlamada } from "./components/AvisoDeLlamada";
import type { Language, TranslationKey } from "@/lib/i18n";

// El `t` del componente que dibuja (useLanguage). Se pasa desde afuera y no se
// usa `traducir()` porque esto se DIBUJA: tiene que seguir al botón ES/EN.
export type Traductor = (key: TranslationKey, params?: Record<string, string | number>) => string;

// En español se queda el locale "es" de siempre (hora 14:30, "14 jul"): cambiarlo
// por "es-CO" cambiaría lo que ya se ve. Solo en inglés pasa a en-US.
const localeDe = (lang: Language) => (lang === "en" ? "en-US" : "es");

export function formatTime(dateStr: string | undefined, t: Traductor, lang: Language) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 86400000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString(localeDe(lang), { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 172800000) return t("messenger.preview.ayer");
  // "14 jul", no "14/07": el formato numérico es ambiguo (¿día/mes o
  // mes/día?) y el resto de la app ya usa el mes abreviado.
  return date.toLocaleDateString(localeDe(lang), { day: "numeric", month: "short" });
}

export function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/** Una línea que describe el último mensaje: "Tú: hola", "📷 Foto", "🎤 Nota de voz"… */
export function getMessagePreview(
  conversation: ConversationWithDetails,
  userId: string | undefined,
  t: Traductor,
) {
  const lastMsg = conversation.lastMessage;
  if (!lastMsg) return t("messenger.preview.sinMensajes");
  if (lastMsg.is_deleted) return t("messenger.preview.eliminado");
  // El texto de un mensaje de sistema es DATO (se guardó así en chat_messages).
  if (lastMsg.type === "system") {
    const llamada = datosDeLlamada(lastMsg.content_rich);
    if (llamada) return `📞 ${textoDeLlamada(llamada, t)}`;
    return `ℹ️ ${lastMsg.content || ""}`;
  }
  let body = "";
  if (lastMsg.type === "file") {
    const fn = lastMsg.file_name || "";
    if (/^voice-note/i.test(fn)) body = t("messenger.preview.notaDeVoz");
    else if (/\.(webm|mp3|ogg|m4a|wav)(\?|$)/i.test(fn)) body = t("messenger.preview.audio");
    else body = `📎 ${fn || t("common.file")}`;
  } else if (lastMsg.type === "image") body = t("messenger.preview.foto");
  else body = lastMsg.content || "";
  // Por API: «BLU (API): …» siempre, también en los directos y en los míos. Si no,
  // la lista diría «Jhon» (o nada, o «Tú») y adentro del chat «BLU». El nombre es
  // dato de la fila; la etiqueta, la misma del aviso y la campana.
  if (lastMsg.api_key_id != null) {
    const nombre = lastMsg.api_display_name?.trim() || t("messenger.api.etiqueta");
    return `${t("shared.msgNotif.viaApi", { name: nombre })}: ${body}`;
  }
  if (conversation.type === "group" && lastMsg.sender_id) {
    const senderName = lastMsg.sender_id === userId
      ? t("messenger.preview.tu")
      : (conversation.participants.find((p) => p.user_id === lastMsg.sender_id)?.profile?.full_name?.split(" ")[0] || "");
    if (senderName) return `${senderName}: ${body}`;
  }
  return body;
}
