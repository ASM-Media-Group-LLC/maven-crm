-- Multi-asignado por conversación. Antes: wa_conversations.assigned_to (1 dueño).
-- Ahora: tabla N:N. assigned_to se conserva como "principal" (compat con código que lo lee).
create table if not exists public.wa_conversation_assignees (
  conversation_id uuid not null references public.wa_conversations(id) on delete cascade,
  user_id uuid not null,
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists idx_wa_conv_assignees_user on public.wa_conversation_assignees(user_id);

insert into public.wa_conversation_assignees (conversation_id, user_id)
  select id, assigned_to from public.wa_conversations where assigned_to is not null
  on conflict do nothing;

create or replace function public.is_wa_assignee(p_conversation_id uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.wa_conversation_assignees a
    where a.conversation_id = p_conversation_id and a.user_id = p_uid
  );
$$;

alter table public.wa_conversation_assignees enable row level security;

create policy wa_conv_assignees_select on public.wa_conversation_assignees
  for select to authenticated
  using (public.has_wa_inbox_global_scope(auth.uid()) or user_id = auth.uid()
         or public.is_wa_assignee(conversation_id, auth.uid()));

create policy wa_conv_assignees_write on public.wa_conversation_assignees
  for all to authenticated
  using (public.has_permission(auth.uid(), 'WhatsApp', 'Asignar conversaciones'))
  with check (public.has_permission(auth.uid(), 'WhatsApp', 'Asignar conversaciones'));

drop policy if exists wa_conversations_select on public.wa_conversations;
create policy wa_conversations_select on public.wa_conversations
  for select to authenticated
  using (
    (tenant_id = current_tenant_id())
    and (
      public.has_wa_inbox_global_scope(auth.uid())
      or assigned_to = auth.uid()
      or public.is_wa_assignee(id, auth.uid())
    )
  );

alter table public.wa_channels add column if not exists default_assignees uuid[] not null default '{}';
comment on column public.wa_channels.default_assignees is
  'Usuarios a los que se auto-asignan las conversaciones NUEVAS de esta línea (whatsapp-ingest). Vacío = ninguna.';
