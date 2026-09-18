-- EDITAR UN MENSAJE DEJABA EL TEXTO RICO VIEJO.
--
-- Jhon (18/09): "al editar un mensaje y darle guardar, no se guarda lo que
-- edité". Sí se guardaba: content cambiaba, pero content_rich (el documento
-- del editor de texto rico) quedaba igual, y la burbuja pinta content_rich
-- cuando existe. Los 20 mensajes editados con texto rico estaban así, los 20.
--
-- El frontend ahora vacía content_rich al editar. Esto repara los que ya
-- quedaron mal, con respaldo del documento rico por si hiciera falta volver.
create table if not exists public.chat_messages_rich_respaldo_20260918 (
  id uuid primary key,
  content_rich jsonb not null,
  respaldado_en timestamptz not null default now()
);
alter table public.chat_messages_rich_respaldo_20260918 enable row level security;
revoke all on public.chat_messages_rich_respaldo_20260918 from anon, authenticated;

with e as (
  select m.id, m.content, m.content_rich,
    (select string_agg(x #>> '{}', '')
       from jsonb_array_elements(jsonb_path_query_array(m.content_rich, 'strict $.**.text')) x) as texto_rico
  from public.chat_messages m
  where m.is_edited = true and m.content_rich is not null and m.is_deleted = false
)
insert into public.chat_messages_rich_respaldo_20260918 (id, content_rich)
select id, content_rich from e
where btrim(coalesce(texto_rico, '')) <> btrim(coalesce(content, ''))
on conflict (id) do nothing;

update public.chat_messages m
set content_rich = null
from public.chat_messages_rich_respaldo_20260918 r
where r.id = m.id and m.content_rich is not null;
