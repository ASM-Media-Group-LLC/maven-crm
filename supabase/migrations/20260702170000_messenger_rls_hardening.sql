-- Messenger (chat interno del staff) — blindaje de RLS.
-- Cierra fugas verificadas EN VIVO por la auditoría del 2026-07-02:
--   C1 (crítico): cualquier usuario autenticado se auto-agregaba a CUALQUIER conversación
--                 (chat_participants INSERT: "... OR auth.uid()=user_id") y leía todo su historial.
--   C2 (crítico): delete_conversation_cascade() era SECURITY DEFINER sin ningún chequeo de auth
--                 y con EXECUTE a PUBLIC/anon → cualquiera borraba cualquier chat por UUID.
--   A3 (alto):    la policy DELETE "Admins can remove participants" sólo chequeaba membresía,
--                 no rol → cualquier miembro expulsaba a otros (incluido el admin).
--   M4 (medio):   la policy UPDATE de chat_conversations sólo chequeaba membresía → cualquier
--                 miembro renombraba/cambiaba avatar del grupo. (El UPDATE debe seguir abierto
--                 porque cada mensaje hace bump de updated_at → se restringe por columna vía trigger.)

-- Helper: ¿es admin del grupo? SECURITY DEFINER como is_chat_participant (evita recursión de RLS).
CREATE OR REPLACE FUNCTION public.is_chat_admin(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE user_id = _user_id AND conversation_id = _conversation_id AND role = 'admin'
  );
$$;

-- ── C1 · chat_participants INSERT ──────────────────────────────────────────────
-- Un participante existente puede agregar a otros (alta de miembros); y el auto-alta
-- (auth.uid()=user_id) SÓLO se permite si sos el created_by de la conversación (alta al crearla).
DROP POLICY IF EXISTS "Users can add participants" ON public.chat_participants;
CREATE POLICY "Users can add participants" ON public.chat_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    is_chat_participant(auth.uid(), conversation_id)
    OR (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM public.chat_conversations c
        WHERE c.id = conversation_id AND c.created_by = auth.uid()
      )
    )
  );

-- ── A3 · chat_participants DELETE ──────────────────────────────────────────────
-- Sólo un admin del grupo expulsa a otros; cualquiera puede salir (borrar su propia fila).
DROP POLICY IF EXISTS "Admins can remove participants" ON public.chat_participants;
CREATE POLICY "Admins can remove participants" ON public.chat_participants
  FOR DELETE TO authenticated
  USING (
    is_chat_admin(auth.uid(), conversation_id)
    OR auth.uid() = user_id
  );

-- ── M4 · chat_conversations metadata (name/description/avatar_url) ──────────────
-- La policy UPDATE queda como está (todos los participantes necesitan UPDATE para el bump
-- de updated_at al enviar). Un trigger bloquea cambios de metadatos por no-admins.
CREATE OR REPLACE FUNCTION public.guard_chat_conversation_meta()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.name        IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.avatar_url  IS DISTINCT FROM OLD.avatar_url)
     AND auth.uid() IS NOT NULL                          -- service_role (backend) no restringido
     AND NOT is_chat_admin(auth.uid(), OLD.id)
     AND OLD.created_by <> auth.uid()
  THEN
    RAISE EXCEPTION 'Solo un admin del grupo puede editar sus datos';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_chat_conversation_meta ON public.chat_conversations;
CREATE TRIGGER trg_guard_chat_conversation_meta
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_chat_conversation_meta();

-- ── C2 · delete_conversation_cascade() ─────────────────────────────────────────
-- Se agrega autorización: hay que ser participante; en grupos, además admin. (En DMs, cualquier
-- participante puede borrar su conversación.) Cuerpo de cascada idéntico al original.
CREATE OR REPLACE FUNCTION public.delete_conversation_cascade(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _msg_ids uuid[];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM chat_conversations c
    JOIN chat_participants p ON p.conversation_id = c.id AND p.user_id = auth.uid()
    WHERE c.id = _conversation_id
      AND (c.type = 'direct' OR p.role = 'admin')
  ) THEN
    RAISE EXCEPTION 'No autorizado para eliminar esta conversación';
  END IF;

  SELECT array_agg(id) INTO _msg_ids
  FROM chat_messages
  WHERE conversation_id = _conversation_id;

  IF _msg_ids IS NOT NULL AND array_length(_msg_ids, 1) > 0 THEN
    DELETE FROM chat_reactions WHERE message_id = ANY(_msg_ids);
    DELETE FROM chat_read_receipts WHERE message_id = ANY(_msg_ids);
  END IF;

  DELETE FROM chat_pinned WHERE conversation_id = _conversation_id;
  DELETE FROM chat_archived WHERE conversation_id = _conversation_id;
  DELETE FROM chat_space_conversations WHERE conversation_id = _conversation_id;
  DELETE FROM chat_messages WHERE conversation_id = _conversation_id;
  DELETE FROM chat_participants WHERE conversation_id = _conversation_id;
  DELETE FROM notifications WHERE reference_id = _conversation_id AND reference_type = 'conversation';
  DELETE FROM chat_conversations WHERE id = _conversation_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_conversation_cascade(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_conversation_cascade(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_conversation_cascade(uuid) TO authenticated;
