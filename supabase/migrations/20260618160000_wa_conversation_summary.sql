-- Rolling summary de conversaciones de la bandeja (BW-Slice 5).
-- Guarda un resumen IA por conversación para que el bot (y, a futuro, la UI del
-- inbox) tenga la NARRATIVA completa de relaciones largas sin leer 200+ mensajes.
-- Lo genera el cron wa-conversation-summarize (Haiku), incremental por watermark.
--
-- Columnas:
--   summary                    — el tl;dr generado (texto plano, español)
--   summary_updated_at         — cuándo se generó por última vez (solo en éxito)
--   last_summarized_message_at — watermark: sent_at del último mensaje incluido.
--                                El cron re-procesa cuando last_message_at lo supera.
--   summary_model              — qué modelo lo generó (auditoría/recálculo futuro)
alter table public.wa_conversations
  add column if not exists summary text,
  add column if not exists summary_updated_at timestamptz,
  add column if not exists last_summarized_message_at timestamptz,
  add column if not exists summary_model text;

-- Índice parcial para que el picker del cron (conversaciones "stale" recientes)
-- no escanee toda la tabla: solo las que tienen actividad y watermark atrasado.
create index if not exists idx_wa_conversations_summary_stale
  on public.wa_conversations (last_message_at desc)
  where last_message_at is not null;

comment on column public.wa_conversations.summary is
  'Resumen IA de la conversación (rolling, generado por wa-conversation-summarize). Narrativa para el bot/UI sin leer todo el historial.';
comment on column public.wa_conversations.last_summarized_message_at is
  'Watermark: sent_at del último mensaje incluido en summary. El cron re-resume cuando llegan mensajes más nuevos.';

-- Picker del cron: conversaciones activas (últimos p_days) cuyo watermark quedó
-- atrasado (o nunca se resumieron). La comparación columna-vs-columna
-- (last_message_at > last_summarized_message_at) no es expresable en PostgREST,
-- así que vive acá en SQL. SECURITY DEFINER: la invoca el edge con service_role.
create or replace function public.wa_conversations_needing_summary(
  p_limit int default 6,
  p_days int default 45
)
returns table(id uuid, tenant_id uuid, last_message_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id, c.tenant_id, c.last_message_at
  from public.wa_conversations c
  where c.last_message_at is not null
    and c.last_message_at >= now() - make_interval(days => p_days)
    and (c.last_summarized_message_at is null or c.last_message_at > c.last_summarized_message_at)
  order by c.last_message_at desc
  limit p_limit
$$;

-- Lockear a clientes (anon/authenticated): solo el edge (service_role) y postgres.
revoke all on function public.wa_conversations_needing_summary(int, int) from public, anon, authenticated;
grant execute on function public.wa_conversations_needing_summary(int, int) to service_role;
