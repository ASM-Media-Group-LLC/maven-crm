export interface ChatConversation {
  id: string;
  type: "direct" | "group";
  name: string | null;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Permisos de grupo estilo WhatsApp (solo aplican a type='group'). Opcionales por
  // compatibilidad con objetos optimistas.
  msg_permission?: "all" | "admins";        // quién puede enviar mensajes (ausente = 'all')
  members_visibility?: "all" | "admins";    // quién puede ver la lista de miembros (ausente = 'all')
  info_permission?: "all" | "admins";       // quién puede editar nombre/foto/desc (ausente = 'admins')
  add_permission?: "all" | "admins";        // quién puede agregar miembros (ausente = 'admins')
  require_approval?: boolean;               // un admin debe aprobar a los que agrega un no-admin
}

export interface ChatParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
  last_read_at: string | null;
  is_muted: boolean;
  notifications_mode: "all" | "mentions" | "none";
}

/** Nodo del documento TipTap guardado en chat_messages.content_rich. */
export interface RichNode {
  type?: string;
  text?: string;
  content?: RichNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  type: "text" | "image" | "file" | "system";
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  reply_to_id: string | null;
  // Varias imágenes enviadas en un mismo envío comparten album_id y se dibujan
  // como UNA cuadrícula (álbum estilo WhatsApp). Opcional: filas viejas no lo tienen.
  album_id?: string | null;
  // true = enviado DESDE el panel de hilo: vive solo en el hilo, el timeline
  // principal lo esconde. Las citas ("Responder") quedan en false y se ven inline.
  is_thread_reply?: boolean;
  is_edited: boolean;
  is_deleted: boolean;
  /** Documento TipTap (JSON) con el formato. NULL/ausente = texto plano.
   *  El texto plano SIEMPRE vive en `content` (vista previa, búsqueda, menciones). */
  content_rich?: RichNode | null;
  created_at: string;
  updated_at: string;
  // Solo cliente (no viene de la BD): estado de envío de un mensaje propio optimista.
  // 'sending' = en vuelo; 'failed' = no se pudo enviar (offline o error) → se puede reintentar.
  _localStatus?: "sending" | "failed";
}

export interface ChatReadReceipt {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string;
}

export interface ChatReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_seed?: string | null;
  whatsapp_push_name?: string | null;
}

// Enriched conversation for UI
export interface ConversationWithDetails extends ChatConversation {
  participants: (ChatParticipant & { profile?: UserProfile })[];
  lastMessage?: ChatMessage;
  unreadCount: number;
  displayName: string;
}

// VideoRoom se eliminó: las reuniones ahora son filas de `meet_rooms` (ver
// hooks/useMeetRooms). El tipo describía salas que vivían en memoria y se
// perdían al recargar.
