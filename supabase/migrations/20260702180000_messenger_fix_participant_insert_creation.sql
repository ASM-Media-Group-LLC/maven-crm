-- HOTFIX de la regresión introducida por 20260702170000_messenger_rls_hardening.
--
-- Esa migración reescribió la policy INSERT de chat_participants (cierre del crítico C1)
-- usando un EXISTS sobre chat_conversations dentro del WITH CHECK. Ese subquery queda
-- sujeto a la RLS de chat_conversations (cuya policy SELECT exige is_chat_participant).
-- Al CREAR un chat, el creador todavía no es participante → no "ve" la conversación
-- recién insertada → el EXISTS devolvía false → fallaba el auto-alta del creador →
-- NO se podían crear grupos ni DMs nuevos ("me dio error" al crear grupo).
--
-- Fix: mover el chequeo de created_by a una función SECURITY DEFINER (lee sin RLS),
-- igual que is_chat_participant. Sigue cerrando C1: un atacante no es el created_by de
-- una conversación ajena → is_conversation_creator() = false → no puede auto-agregarse.

CREATE OR REPLACE FUNCTION public.is_conversation_creator(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE id = _conversation_id AND created_by = _user_id
  );
$$;

DROP POLICY IF EXISTS "Users can add participants" ON public.chat_participants;
CREATE POLICY "Users can add participants" ON public.chat_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    is_chat_participant(auth.uid(), conversation_id)
    OR (auth.uid() = user_id AND is_conversation_creator(auth.uid(), conversation_id))
  );
