-- CORREO · guardar las cabeceras que encadenan una conversación.
--
-- Lo reportó Keila: «los hilos se muestran como correos aparte, eso necesita
-- orden sino que caos va a ser funcionar por ahí».
--
-- `mail_messages` guardaba `message_id` pero NO las dos cabeceras que dicen de
-- qué cuelga cada correo. Sin ellas, encadenar solo se puede adivinar por el
-- asunto — y adivinar une de más, que se parece demasiado a perder correo.
--
-- ⚠️ Esto NO llena los correos ya guardados: solo los que sincronicen de acá
-- en adelante. Los viejos se agrupan por asunto + participantes + ventana de
-- 30 días (ver `lib/mailHilos.ts`), que es el camino de respaldo y existe
-- justamente para que la bandeja no quede suelta hasta el próximo
-- resincronizado completo.

ALTER TABLE public.mail_messages
  ADD COLUMN IF NOT EXISTS in_reply_to text,
  -- Se llama `refs` y no `references` a propósito: `references` es palabra
  -- reservada de SQL y obligaría a quotearla en cada consulta futura, en cada
  -- migración y en cada herramienta. Un nombre que hay que recordar escribir
  -- distinto es un nombre que alguien va a escribir mal.
  ADD COLUMN IF NOT EXISTS refs text[];

COMMENT ON COLUMN public.mail_messages.in_reply_to IS
  'Cabecera In-Reply-To (RFC 5322): el message_id del correo al que responde.';
COMMENT ON COLUMN public.mail_messages.refs IS
  'Cabecera References: la cadena de message_id del hilo, del mas viejo al mas nuevo.';

-- Buscar "todo lo que cuelga de este correo" dentro del buzón de una persona.
-- Va por `user_id` adelante porque toda consulta del correo arranca por ahí.
CREATE INDEX IF NOT EXISTS mail_messages_in_reply_to_idx
  ON public.mail_messages (user_id, in_reply_to)
  WHERE in_reply_to IS NOT NULL;
