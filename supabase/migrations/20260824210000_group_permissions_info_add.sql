-- Permisos de grupo (Tanda B): editar info solo-admins + agregar miembros configurable.
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS info_permission text NOT NULL DEFAULT 'admins',
  ADD COLUMN IF NOT EXISTS add_permission  text NOT NULL DEFAULT 'admins';
ALTER TABLE public.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_info_permission_chk;
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_info_permission_chk CHECK (info_permission IN ('all','admins'));
ALTER TABLE public.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_add_permission_chk;
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_add_permission_chk CHECK (add_permission IN ('all','admins'));

-- Trigger ampliado: (1) cambiar cualquiera de los 4 permisos = solo admin; (2) editar
-- info (nombre/desc/foto) de un grupo con info_permission='admins' = solo admin. NO bloquea
-- el bump de updated_at (esas 3 columnas no cambian al enviar un mensaje).
CREATE OR REPLACE FUNCTION public.guard_chat_conversation_perms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (NEW.msg_permission     IS DISTINCT FROM OLD.msg_permission
      OR NEW.members_visibility IS DISTINCT FROM OLD.members_visibility
      OR NEW.info_permission  IS DISTINCT FROM OLD.info_permission
      OR NEW.add_permission   IS DISTINCT FROM OLD.add_permission)
     AND NOT public.is_chat_admin(auth.uid(), OLD.id) THEN
    RAISE EXCEPTION 'Solo un admin puede cambiar los permisos del grupo';
  END IF;
  IF (NEW.name IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url)
     AND OLD.type = 'group'
     AND coalesce(OLD.info_permission, 'admins') = 'admins'
     AND NOT public.is_chat_admin(auth.uid(), OLD.id) THEN
    RAISE EXCEPTION 'Solo un admin puede editar la información del grupo';
  END IF;
  RETURN NEW;
END; $$;

-- Agregar participantes: admin O el creador se agrega a sí mismo O (add_permission='all' y participante).
DROP POLICY IF EXISTS "Users can add participants" ON public.chat_participants;
CREATE POLICY "Users can add participants" ON public.chat_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_id AND public.is_conversation_creator(auth.uid(), conversation_id))
    OR public.is_chat_admin(auth.uid(), conversation_id)
    OR (
      public.is_chat_participant(auth.uid(), conversation_id)
      AND EXISTS (SELECT 1 FROM public.chat_conversations c
                  WHERE c.id = conversation_id AND c.type='group' AND c.add_permission='all')
    )
  );
