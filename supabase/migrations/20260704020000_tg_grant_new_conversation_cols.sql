-- HOTFIX 403: tg_conversations usa grants por COLUMNA (por el REVOKE de peer_phone en S3.1),
-- así que las columnas agregadas después NO heredan el SELECT de authenticated → cualquier
-- select() del frontend que las incluya devuelve 403 (permiso denegado) y la lista queda vacía.
-- Pasó al agregar manually_unread (lista de conversaciones no cargaba). Grantamos las columnas
-- nuevas (NUNCA peer_phone, que sigue revocado por PII).
--
-- REGLA: toda columna nueva en tg_conversations necesita su grant select explícito a authenticated.
grant select (manually_unread, closer_creator_id) on public.tg_conversations to authenticated;
