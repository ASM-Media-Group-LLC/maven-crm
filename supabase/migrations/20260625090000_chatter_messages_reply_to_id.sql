-- Reply/cita en Chatter Evaluator: un mensaje puede referenciar a otro (como WhatsApp).
-- on delete set null: si el original se borra (hard delete), la cita queda en null y el
-- frontend muestra "mensaje" sin romper. app_get_chatter_messages (SETOF chatter_messages +
-- select *) y el SELECT directo del chatter público (select *) ya traen la columna solos.
alter table public.chatter_messages
  add column if not exists reply_to_id uuid references public.chatter_messages(id) on delete set null;
