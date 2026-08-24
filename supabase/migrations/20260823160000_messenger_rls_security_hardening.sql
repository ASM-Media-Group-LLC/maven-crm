-- Messenger — blindaje de seguridad RLS (pre-lanzamiento a ~60 personas).
-- Cierra 5 huecos CONFIRMADOS por la auditoría: la UI los oculta pero se explotan
-- llamando la API directamente (supabase-js) saltando los gates del front.
--
-- ⚠️ REVISAR antes de aplicar a prod: verificar los nombres de policy vivos con
--    `select policyname, cmd from pg_policies where tablename like 'chat_%';`
--    Este archivo asume las policies base (20260226161941) + hardening (20260702170000)
--    + fix INSERT participants (20260702180000). Helpers usados (ya existen):
--    is_chat_participant, is_chat_admin, is_conversation_creator.
-- NOTA: el bucket público `chat-files` y el XSS de file_url NO se arreglan acá
--    (requieren cambios de frontend: URLs firmadas + validar esquema). Van aparte.

-- ── 1. Escalada de privilegios: un miembro se auto-asciende a admin ──────────────
-- La policy UPDATE de chat_participants es USING (auth.uid()=user_id) sin WITH CHECK:
-- un miembro puede editar su propia fila y ponerse role='admin'. Un trigger bloquea
-- cambios de role (y de user_id/conversation_id) salvo que el actor sea admin del grupo
-- o backend (service_role → auth.uid() IS NULL).
CREATE OR REPLACE FUNCTION public.guard_chat_participant_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- backend / service_role: sin restricción
  END IF;
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id)
     AND NOT public.is_chat_admin(auth.uid(), OLD.conversation_id)
  THEN
    RAISE EXCEPTION 'No autorizado: solo un admin del grupo puede cambiar el rol o la membresía';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_chat_participant_update ON public.chat_participants;
CREATE TRIGGER trg_guard_chat_participant_update
  BEFORE UPDATE ON public.chat_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_chat_participant_update();

-- ── 1b. Varios admins (modelo WhatsApp): un admin puede editar la fila de OTROS ──────
-- La policy UPDATE era USING (auth.uid()=user_id) → solo tu propia fila, así que ningún
-- admin podía promover/degradar a otro (nunca habría 2º admin). Se permite además al admin
-- del grupo. El trigger de arriba sigue garantizando que SOLO un admin cambie 'role'
-- (un miembro común sigue sin poder auto-ascenderse).
DROP POLICY IF EXISTS "Users can update their own participation" ON public.chat_participants;
CREATE POLICY "Users can update their own participation"
  ON public.chat_participants FOR UPDATE
  USING (auth.uid() = user_id OR public.is_chat_admin(auth.uid(), conversation_id));

-- ── 2. Mover un mensaje a CUALQUIER conversación (inyección en chats ajenos) ──────
-- La policy UPDATE de chat_messages es USING (auth.uid()=sender_id) sin WITH CHECK:
-- se puede cambiar conversation_id a un chat ajeno. Se agrega WITH CHECK que reafirma
-- membresía del destino + autoría, y un trigger que impide cambiar conversation_id/sender_id.
DROP POLICY IF EXISTS "Users can update their own messages" ON public.chat_messages;
CREATE POLICY "Users can update their own messages"
  ON public.chat_messages FOR UPDATE
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id AND public.is_chat_participant(auth.uid(), conversation_id));

CREATE OR REPLACE FUNCTION public.guard_chat_message_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- backend / service_role
  END IF;
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN
    RAISE EXCEPTION 'No autorizado: no se puede mover un mensaje ni cambiar su autor';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_chat_message_update ON public.chat_messages;
CREATE TRIGGER trg_guard_chat_message_update
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_chat_message_update();

-- ── 3. Alta de participantes: cualquier miembro agrega gente (revierte expulsiones) ─
-- Actual (20260702180000): WITH CHECK (is_chat_participant OR (auth.uid()=user_id AND creator)).
-- O sea basta ser participante para insertar filas de OTROS. Se alinea con DELETE (admin-only):
-- auto-alta SOLO del creador al crear; alta de otros SOLO por admin del grupo.
-- (No rompe la creación: el creador se inserta como admin y luego, ya admin, agrega miembros.)
DROP POLICY IF EXISTS "Users can add participants" ON public.chat_participants;
CREATE POLICY "Users can add participants" ON public.chat_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_id AND public.is_conversation_creator(auth.uid(), conversation_id))
    OR public.is_chat_admin(auth.uid(), conversation_id)
  );

-- ── 4. Recibos falsificables en chats ajenos ────────────────────────────────────
-- INSERT de chat_read_receipts solo exige auth.uid()=user_id → se pueden crear recibos
-- para mensajes de conversaciones donde no participás. Se exige participación en el chat
-- del mensaje. (El UPDATE ya está acotado a auth.uid()=user_id por 20260702190000.)
DROP POLICY IF EXISTS "Users can mark messages as read" ON public.chat_read_receipts;
CREATE POLICY "Users can mark messages as read"
  ON public.chat_read_receipts FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = message_id AND public.is_chat_participant(auth.uid(), m.conversation_id)
    )
  );

-- ── 5. get_unread_counts: SECURITY DEFINER con _user_id arbitrario ───────────────
-- Cualquiera puede leer los no-leídos de otro pasando su id. Se acota: un usuario
-- autenticado solo ve los suyos; backend (service_role, auth.uid() IS NULL) mantiene
-- el comportamiento actual. Cuerpo idéntico salvo el guard del WHERE.
CREATE OR REPLACE FUNCTION public.get_unread_counts(_user_id uuid)
RETURNS TABLE(conversation_id uuid, unread_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT cp.conversation_id, COUNT(cm.id) AS unread_count
  FROM chat_participants cp
  LEFT JOIN chat_messages cm
    ON cm.conversation_id = cp.conversation_id
   AND cm.sender_id != _user_id
   AND cm.is_deleted = false          -- (bug conocido: antes contaba mensajes borrados)
   AND (cp.last_read_at IS NULL OR cm.created_at > cp.last_read_at)
  WHERE cp.user_id = _user_id
    AND (_user_id = auth.uid() OR auth.uid() IS NULL)   -- guard: solo lo tuyo (o backend)
  GROUP BY cp.conversation_id;
$$;
