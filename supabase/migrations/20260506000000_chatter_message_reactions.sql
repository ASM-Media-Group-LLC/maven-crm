-- chatter_messages.reactions — columna jsonb para guardar las
-- reacciones (emoji + user_id + nombre + timestamp) que los usuarios
-- dejan sobre un mensaje en el Chatter Evaluator. Default '[]'::jsonb
-- para que filas existentes queden con array vacío.
--
-- Estructura del array:
--   [
--     { "user_id":"uuid","user_name":"Test Admin","emoji":"👍","created_at":"..." },
--     ...
--   ]
--
-- El frontend usa toggle: el mismo user con el mismo emoji vuelve a
-- clickear y se quita. Realtime: chatter_messages ya está suscripto
-- en el client, así que un UPDATE de reactions notifica a todos los
-- clientes conectados.

ALTER TABLE public.chatter_messages
  ADD COLUMN IF NOT EXISTS reactions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill (no-op para nuevas; cubre filas que pudieran haber quedado
-- con NULL si el DEFAULT no aplicó):
UPDATE public.chatter_messages
SET reactions = '[]'::jsonb
WHERE reactions IS NULL;
