export interface ChatConversation {
  id: string;
  type: "direct" | "group";
  name: string | null;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
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
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
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
