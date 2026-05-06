-- Drop apps_script_url from chatter_config + qa_config.
--
-- Migramos el envío de notificaciones de Chatter Evaluator y Agency QA
-- de Apps Script a Resend (edge function send-notification-email). El
-- frontend ya no lee ni escribe esta columna (PR #29). Limpiamos el
-- schema para que no quede vestigio.

ALTER TABLE public.chatter_config DROP COLUMN IF EXISTS apps_script_url;
ALTER TABLE public.qa_config       DROP COLUMN IF EXISTS apps_script_url;
