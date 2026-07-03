-- S3.1 canal Telegram: RLS de LECTURA por dueño en la bandeja + masking de peer_phone (PII).
-- Espejo de wa_conversations/wa_conversation_messages (20260604210000_wa_inbox_strict_visibility).
-- Las tablas se crearon en 20260703000000 con RLS ON y SIN políticas (deny-all salvo service_role);
-- acá abrimos SOLO lectura, gateada por dueño. Idempotente. Aplicada en prod vía MCP; este archivo
-- la deja en el repo.

-- 1) Lectura por dueño: closer ve SOLO sus conversaciones asignadas; supervisor+ ven todo.
--    (base = misma que WhatsApp; el refinamiento por data_scope se difiere a un slice posterior.)
drop policy if exists tg_conversations_select on public.tg_conversations;
create policy tg_conversations_select on public.tg_conversations
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_in_role_group(auth.uid(), 'supervisor_or_above')
      or assigned_to = auth.uid()
    )
  );

drop policy if exists tg_messages_select on public.tg_messages;
create policy tg_messages_select on public.tg_messages
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.tg_conversations c
      where c.id = tg_messages.conversation_id
        and (
          public.is_in_role_group(auth.uid(), 'supervisor_or_above')
          or c.assigned_to = auth.uid()
        )
    )
  );
-- Sin INSERT/UPDATE/DELETE para authenticated → solo service_role (ingest + edges) escribe.

-- 2) Masking de peer_phone (PII): REVOKE de la columna a authenticated/anon + grant del resto.
--    Patrón de oro de Maven (masking NO es solo UI). Lista de columnas no-PII generada dinámica
--    para que sea EXACTA. El cliente debe leer columnas explícitas (nunca select *).
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'tg_conversations'
    and column_name <> 'peer_phone';
  execute 'revoke select on public.tg_conversations from authenticated, anon';
  execute format('grant select (%s) on public.tg_conversations to authenticated', cols);
end $$;

-- 3) Marcar leído (RPC SECURITY DEFINER, respeta dueño). El cliente no puede UPDATE directo.
create or replace function public.tg_mark_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tg_conversations
     set unread_count = 0, updated_at = now()
   where id = p_conversation_id
     and tenant_id = public.current_tenant_id()
     and (
       public.is_in_role_group(auth.uid(), 'supervisor_or_above')
       or assigned_to = auth.uid()
     );
end;
$$;
grant execute on function public.tg_mark_read(uuid) to authenticated;

notify pgrst, 'reload schema';
