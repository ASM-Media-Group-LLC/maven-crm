-- Permisos de grupo (Tanda C): aprobar nuevos miembros. Cola de solicitudes ADITIVA: no
-- toca is_chat_participant ni la visibilidad del chat (un pendiente NO es participante).
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS require_approval boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.chat_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,        -- la persona a agregar
  requested_by uuid NOT NULL,   -- quién la propuso
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);
ALTER TABLE public.chat_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view join requests" ON public.chat_join_requests;
CREATE POLICY "view join requests" ON public.chat_join_requests FOR SELECT TO authenticated
  USING (public.is_chat_admin(auth.uid(), conversation_id) OR requested_by = auth.uid());

DROP POLICY IF EXISTS "create join request" ON public.chat_join_requests;
CREATE POLICY "create join request" ON public.chat_join_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND public.is_chat_participant(auth.uid(), conversation_id)
    AND EXISTS (SELECT 1 FROM public.chat_conversations c
                WHERE c.id = conversation_id AND c.type='group'
                  AND c.add_permission='all' AND c.require_approval = true)
  );

DROP POLICY IF EXISTS "delete join request" ON public.chat_join_requests;
CREATE POLICY "delete join request" ON public.chat_join_requests FOR DELETE TO authenticated
  USING (public.is_chat_admin(auth.uid(), conversation_id) OR requested_by = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_join_requests;

-- require_approval también es admin-only (se suma al guard existente de permisos).
CREATE OR REPLACE FUNCTION public.guard_chat_conversation_perms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (NEW.msg_permission     IS DISTINCT FROM OLD.msg_permission
      OR NEW.members_visibility IS DISTINCT FROM OLD.members_visibility
      OR NEW.info_permission  IS DISTINCT FROM OLD.info_permission
      OR NEW.add_permission   IS DISTINCT FROM OLD.add_permission
      OR NEW.require_approval IS DISTINCT FROM OLD.require_approval)
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
