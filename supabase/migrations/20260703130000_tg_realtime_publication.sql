-- Sin esto, la bandeja de Telegram NO recibe mensajes en vivo (las tablas nuevas no entran
-- solas a la publicación de realtime → el .on('postgres_changes', tg_*) del front queda mudo
-- y los DMs solo aparecían al recargar). Espejo de wa_conversations/wa_conversation_messages.
-- Ya aplicado en prod vía MCP. Idempotente-safe: si ya está, el ALTER falla → se envuelve.
do $$
begin
  begin alter publication supabase_realtime add table public.tg_conversations; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.tg_messages;      exception when duplicate_object then null; end;
end $$;
