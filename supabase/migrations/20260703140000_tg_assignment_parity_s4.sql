-- S4 Telegram: PARIDAD DE ASIGNACIÓN con WhatsApp (espejo 1:1 del stack de wa_*):
--   · tg_channels: config por cuenta/línea del gateway (label + default_assignees) — la
--     línea AUTO-ASIGNA las conversaciones nuevas a miembros del equipo (como wa_channels).
--     El ingest upsertea la fila lazy (account_id) y aplica los defaults.
--   · tg_conversation_assignees: multi-asignado N:N (espejo de wa_conversation_assignees).
--   · is_tg_assignee / has_tg_inbox_global_scope: helpers (espejo de is_wa_assignee /
--     has_wa_inbox_global_scope — respeta data_scope='self' del módulo Telegram).
--   · RPC tg_conversation_set_assignees (espejo de wa_conversation_set_assignees, permiso
--     'Telegram'/'Asignar conversaciones', sincroniza assigned_to denormalizado).
--   · RLS de tg_conversations/tg_messages actualizada: visible si scope global O assigned_to
--     O co-asignado (igual que wa_conversations_select vigente en prod).
-- Ya aplicada en prod vía MCP; idempotente.

-- 1) tg_channels ---------------------------------------------------------------
create table if not exists public.tg_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid default current_tenant_id(),
  account_id text not null unique,           -- id de la cuenta en el gateway ("main", "acct_xxx")
  label text,
  default_assignees uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tg_channels enable row level security;
drop policy if exists tg_channels_select on public.tg_channels;
create policy tg_channels_select on public.tg_channels
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists tg_channels_update on public.tg_channels;
create policy tg_channels_update on public.tg_channels
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_permission(auth.uid(), 'Telegram', 'Cuentas')
  );
grant select, update on public.tg_channels to authenticated;

-- 2) tg_conversation_assignees --------------------------------------------------
create table if not exists public.tg_conversation_assignees (
  conversation_id uuid not null references public.tg_conversations(id) on delete cascade,
  user_id uuid not null,
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.tg_conversation_assignees enable row level security;
grant select, insert, update, delete on public.tg_conversation_assignees to authenticated;

-- 3) helpers --------------------------------------------------------------------
create or replace function public.is_tg_assignee(p_conversation_id uuid, p_uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tg_conversation_assignees a
    where a.conversation_id = p_conversation_id and a.user_id = p_uid
  );
$$;
grant execute on function public.is_tg_assignee(uuid, uuid) to authenticated, service_role;

create or replace function public.has_tg_inbox_global_scope(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.is_in_role_group(_user_id, 'admin')
    or (
      public.is_in_role_group(_user_id, 'supervisor_or_above')
      and not exists (
        select 1
        from public.user_roles ur
        join public.roles_config rc on rc.name = ur.role
        join public.role_permissions rp on rp.role_id = rc.id
        where ur.user_id = _user_id
          and rp.module = 'Telegram'
          and rp.submodule is null
          and rp.data_scope = 'self'
      )
    );
$$;
grant execute on function public.has_tg_inbox_global_scope(uuid) to authenticated, service_role;

-- 4) RLS actualizada (espejo de wa_conversations_select vigente) ------------------
drop policy if exists tg_conversations_select on public.tg_conversations;
create policy tg_conversations_select on public.tg_conversations
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.has_tg_inbox_global_scope(auth.uid())
      or assigned_to = auth.uid()
      or public.is_tg_assignee(id, auth.uid())
    )
  );

drop policy if exists tg_conversations_update on public.tg_conversations;
create policy tg_conversations_update on public.tg_conversations
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_permission(auth.uid(), 'Telegram', 'Asignar conversaciones')
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
          public.has_tg_inbox_global_scope(auth.uid())
          or c.assigned_to = auth.uid()
          or public.is_tg_assignee(c.id, auth.uid())
        )
    )
  );

drop policy if exists tg_conv_assignees_select on public.tg_conversation_assignees;
create policy tg_conv_assignees_select on public.tg_conversation_assignees
  for select to authenticated
  using (
    public.has_tg_inbox_global_scope(auth.uid())
    or user_id = auth.uid()
    or public.is_tg_assignee(conversation_id, auth.uid())
  );
drop policy if exists tg_conv_assignees_write on public.tg_conversation_assignees;
create policy tg_conv_assignees_write on public.tg_conversation_assignees
  for all to authenticated
  using (public.has_permission(auth.uid(), 'Telegram', 'Asignar conversaciones'));

-- 5) RPC de asignación (espejo de wa_conversation_set_assignees) ------------------
create or replace function public.tg_conversation_set_assignees(p_conversation_id uuid, p_user_ids uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), 'Telegram', 'Asignar conversaciones') then
    raise exception 'No tenés permiso para asignar conversaciones.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.tg_conversations
    where id = p_conversation_id and tenant_id = public.current_tenant_id()
  ) then
    raise exception 'Conversación no encontrada.' using errcode = 'P0002';
  end if;

  -- Reemplazar el set de asignados.
  delete from public.tg_conversation_assignees where conversation_id = p_conversation_id;
  if array_length(p_user_ids, 1) is not null then
    insert into public.tg_conversation_assignees (conversation_id, user_id, assigned_by)
    select p_conversation_id, uid, auth.uid()
    from unnest(p_user_ids) as uid
    on conflict (conversation_id, user_id) do nothing;
  end if;

  -- "Principal" denormalizado (compat con código/RLS que lee assigned_to).
  update public.tg_conversations
  set assigned_to = (case when array_length(p_user_ids,1) is null then null else p_user_ids[1] end)
  where id = p_conversation_id and tenant_id = public.current_tenant_id();

  return p_conversation_id;
end;
$$;
grant execute on function public.tg_conversation_set_assignees(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
