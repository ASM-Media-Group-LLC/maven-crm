-- Permisos de grupo estilo WhatsApp (Tanda A): quién puede ENVIAR mensajes y quién puede
-- VER la lista de miembros. Ambos por-grupo, default 'all' (comportamiento actual).
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS msg_permission text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS members_visibility text NOT NULL DEFAULT 'all';

ALTER TABLE public.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_msg_permission_chk;
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_msg_permission_chk CHECK (msg_permission IN ('all','admins'));
ALTER TABLE public.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_members_visibility_chk;
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_members_visibility_chk CHECK (members_visibility IN ('all','admins'));

-- Enforcement de "solo admins pueden enviar" (grupo anuncios): policy RESTRICTIVE que se
-- AND-ea con la INSERT permisiva existente. Los mensajes de SISTEMA (entró/salió/cambio de
-- rol) NO se bloquean; solo los mensajes reales de un no-admin en un grupo announcement.
DROP POLICY IF EXISTS "Announcement groups only admins post" ON public.chat_messages;
CREATE POLICY "Announcement groups only admins post" ON public.chat_messages
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    type = 'system'
    OR public.is_chat_admin(auth.uid(), conversation_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND c.type = 'group' AND c.msg_permission = 'admins'
    )
  );

-- Solo un admin puede CAMBIAR estos permisos (aunque el UPDATE general de chat_conversations
-- no esté gateado todavía — eso es Tanda B, "editar info solo admins").
CREATE OR REPLACE FUNCTION public.guard_chat_conversation_perms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (NEW.msg_permission IS DISTINCT FROM OLD.msg_permission
      OR NEW.members_visibility IS DISTINCT FROM OLD.members_visibility)
     AND NOT public.is_chat_admin(auth.uid(), OLD.id) THEN
    RAISE EXCEPTION 'Solo un admin puede cambiar los permisos del grupo';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_chat_conversation_perms ON public.chat_conversations;
CREATE TRIGGER trg_guard_chat_conversation_perms BEFORE UPDATE ON public.chat_conversations
FOR EACH ROW EXECUTE FUNCTION public.guard_chat_conversation_perms();
