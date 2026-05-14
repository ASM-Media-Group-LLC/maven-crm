-- Bloquear el listado anónimo del bucket chat-files (Messenger interno).
-- Antes: la policy SELECT permitía a anon listar todos los archivos del bucket
-- ("USING (bucket_id = 'chat-files')" sin filtrar por rol → cualquier persona
-- con la publishable key podía hacer POST /object/list/chat-files).
--
-- Después: la policy SELECT requiere role=authenticated. Los URLs públicos
-- guardados en mensajes históricos siguen funcionando porque el bucket sigue
-- marcado public=true y los GET a /object/public/... bypassean RLS — sólo
-- bloqueamos la enumeración del bucket.
--
-- Impacto a nivel usuario: cero. El Messenger funciona idéntico (todos sus
-- users están authenticated). Lo único que se rompe: la capacidad anónima
-- de listar el bucket — que ningún flujo legítimo usa.

DROP POLICY IF EXISTS "Chat files are publicly accessible" ON storage.objects;

CREATE POLICY "Chat files accessible to authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-files');
