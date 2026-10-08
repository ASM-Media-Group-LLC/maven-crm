-- CORREO · reacciones con emoji, como Gmail (Keila, 08/10/2026).
--
-- Una reacción es un correo corto con una parte
-- `text/vnd.google.email-reaction+json` que responde (In-Reply-To) al mensaje
-- reaccionado. Maven guarda su emoji acá: la fila sigue siendo un correo de la
-- caché (lo lee mail-sync al sincronizar, o lo siembra mail-fetch al mandar la
-- reacción), pero la pantalla no la lista como un mensaje más: la muestra como
-- chip debajo del mensaje de su in_reply_to.
--
-- Solo agrega una columna (null = un correo común) y su índice: nada de lo que
-- ya existe cambia. Los que escriben la columna la nombran SOLO cuando hay una
-- reacción, así que funcionan antes y después de esta migración.
--
-- Vuelta atrás:
--| drop index if exists public.mail_messages_reacciones_idx;
--| alter table public.mail_messages drop column if exists reaccion;

alter table public.mail_messages
  add column if not exists reaccion text
  constraint mail_messages_reaccion_corta check (reaccion is null or char_length(reaccion) between 1 and 32);

comment on column public.mail_messages.reaccion is
  'El emoji si el correo es una reacción (como Gmail); null si es un correo común. Ver 20261008180000.';

-- Las reacciones de una conversación: por quién las tiene y a qué responden.
create index if not exists mail_messages_reacciones_idx
  on public.mail_messages (user_id, in_reply_to) where reaccion is not null;
