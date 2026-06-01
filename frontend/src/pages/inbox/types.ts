// Contratos del Inbox de WhatsApp (Slice 1).
//
// Tipos del dominio del núcleo de conversación. Son el contrato entre el backend
// (tablas wa_*) y el front. Los tipos generados de Supabase se regeneran después
// de aplicar la migración; mientras tanto, estos son la fuente de verdad.
//
// IMPORTANTE (masking): el front NUNCA lee wa_contacts.phone_e164 (revocado a
// nivel columna). Para mostrar un número usa SIEMPRE la vista v_wa_contacts, que
// expone `phone` ya enmascarado salvo admin/service_role.

export type WaDepartment = "closer" | "manager" | "recruitment";
export type WaConversationStatus = "open" | "pending" | "closed";
export type WaMessageDirection = "in" | "out";
export type WaMessageType =
  | "text"
  | "audio"
  | "image"
  | "video"
  | "document"
  | "sticker"
  | "system";
export type WaMessageStatus = "sent" | "delivered" | "read" | "failed";

// Contacto tal como lo expone la vista v_wa_contacts (phone YA enmascarado salvo
// admin). El front lee de la vista, no de la tabla base.
export interface WaContact {
  id: string;
  tenant_id: string;
  wa_jid: string;
  /** Enmascarado (•••• + últimos 4) salvo admin/service_role. Puede ser null. */
  phone: string | null;
  display_name: string | null;
  instagram_handle: string | null;
  closer_creator_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WaConversation {
  id: string;
  tenant_id: string;
  contact_id: string;
  /** Línea de empresa que "posee" el hilo (uno-por-closer). */
  channel_jid: string | null;
  department: WaDepartment;
  /** user_id del closer que la atiende; null = sin asignar. */
  assigned_to: string | null;
  status: WaConversationStatus;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface WaConversationMessage {
  id: string;
  tenant_id: string;
  conversation_id: string;
  direction: WaMessageDirection;
  /** Closer que mandó el saliente; null si entrante. */
  sender_user_id: string | null;
  /** id del mensaje en Evolution (idempotencia). */
  external_id: string | null;
  body: string | null;
  msg_type: WaMessageType;
  media_url: string | null;
  status: WaMessageStatus;
  is_ai_assisted: boolean;
  sent_at: string;
  created_at: string;
}

// Fila de la bandeja: conversación + datos mínimos del contacto para la lista.
export interface WaInboxRow extends WaConversation {
  contact: Pick<WaContact, "display_name" | "instagram_handle" | "phone"> | null;
}
