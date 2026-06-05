-- Bandeja: soft-delete NO destructivo de mensajes.
-- "Eliminar para todos" revoca el mensaje en WhatsApp (gateway, fromMe) y acá solo
-- marcamos deleted_at. El contenido (body/media_url/msg_type) se PRESERVA para que el
-- equipo de Maven lo siga viendo en la bandeja con la burbuja en rojo + "mensaje eliminado".
-- (Antes se intentaba msg_type='deleted', que el CHECK de la columna rechazaba -> el UPDATE
--  fallaba en silencio y el usuario no veia ningun cambio al borrar.)
ALTER TABLE public.wa_conversation_messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
