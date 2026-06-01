-- =============================================================================
-- WhatsApp Inbox — modelo de CANALES (números) + visibilidad por canal
-- -----------------------------------------------------------------------------
-- Un "canal" = un número de WhatsApp (una instancia de Evolution). Un
-- departamento (closers, managers, ...) puede tener MUCHOS canales. Un canal
-- puede ser dedicado (1 persona) o compartido (varios miembros). Una persona
-- puede atender varios canales.
--
-- Visibilidad de una conversación (vive en un canal):
--   · admin              -> ve TODO (oversight global).
--   · resto de usuarios  -> ve la conversación si es MIEMBRO de su canal, o si
--                           está asignada a él/ella.
--   Un supervisor "ve su departamento" siendo miembro de los canales de ese
--   depto (se mapea en la pantalla de canales — sin lógica especial de RLS).
--
-- Es additive salvo el rewrite de las policies del inbox: se reescriben para
-- usar la visibilidad por canal en vez del viejo "manager/supervisor ven todo".
-- Como el inbox sigue siendo admin-only (AdminRoute) y admin ve todo, no rompe
-- lo que ya funciona.
-- =============================================================================

-- ── wa_channels ──────────────────────────────────────────────────────────────
create table if not exists public.wa_channels (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null default public.current_tenant_id(),
  evolution_instance text not null,    -- instancia Evolution (= channel_jid de las conversaciones)
  label              text,             -- etiqueta legible (ej. "Closers-1")
  phone_e164         text,             -- número de la línea (de empresa)
  department         text not null default 'closer'
                       check (department in ('closer','manager','recruitment','chatter','other')),
  type               text not null default 'shared' check (type in ('dedicated','shared')),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, evolution_instance)
);
comment on table public.wa_channels is 'Inbox: un número de WhatsApp (instancia Evolution). Un departamento puede tener muchos. dedicated=1 persona, shared=varios (ver wa_channel_members).';

create table if not exists public.wa_channel_members (
  channel_id uuid not null references public.wa_channels(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
comment on table public.wa_channel_members is 'Inbox: quién atiende cada canal. Muchos-a-muchos (un canal con varios miembros = compartido; una persona en varios canales).';
create index if not exists wa_channel_members_user_idx on public.wa_channel_members (user_id);

-- ── link conversación → canal ────────────────────────────────────────────────
alter table public.wa_conversations
  add column if not exists channel_id uuid references public.wa_channels(id) on delete set null;
create index if not exists wa_conversations_channel_idx on public.wa_conversations (channel_id);

create trigger wa_channels_set_updated_at
  before update on public.wa_channels
  for each row execute function public.update_updated_at_column();

-- ── helper de visibilidad: ¿el caller puede ver este canal? ──────────────────
-- admin -> sí (todo); sino -> sí si es miembro del canal.
create or replace function public.wa_can_view_channel(_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_in_role_group(auth.uid(), 'admin')
      or (_channel_id is not null and exists (
        select 1 from public.wa_channel_members m
        where m.channel_id = _channel_id and m.user_id = auth.uid()
      ));
$$;
grant execute on function public.wa_can_view_channel(uuid) to authenticated, service_role;

-- ── RLS de las tablas nuevas ─────────────────────────────────────────────────
alter table public.wa_channels enable row level security;
alter table public.wa_channel_members enable row level security;

-- Canales: admin ve todos; un usuario ve los que atiende. Escritura solo admin.
create policy wa_channels_select on public.wa_channels
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_in_role_group(auth.uid(), 'admin')
      or exists (select 1 from public.wa_channel_members m
                 where m.channel_id = wa_channels.id and m.user_id = auth.uid())
    )
  );
create policy wa_channels_admin_write on public.wa_channels
  for all to authenticated
  using (public.is_in_role_group(auth.uid(), 'admin'))
  with check (public.is_in_role_group(auth.uid(), 'admin'));

-- Miembros: admin ve/edita todo; un usuario ve sus propias filas.
create policy wa_channel_members_select on public.wa_channel_members
  for select to authenticated
  using (public.is_in_role_group(auth.uid(), 'admin') or user_id = auth.uid());
create policy wa_channel_members_admin_write on public.wa_channel_members
  for all to authenticated
  using (public.is_in_role_group(auth.uid(), 'admin'))
  with check (public.is_in_role_group(auth.uid(), 'admin'));

-- ── Rewrite de la visibilidad del inbox (ahora POR CANAL) ────────────────────
drop policy if exists wa_conversations_select on public.wa_conversations;
create policy wa_conversations_select on public.wa_conversations
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (assigned_to = auth.uid() or public.wa_can_view_channel(channel_id))
  );

drop policy if exists wa_conversations_update on public.wa_conversations;
create policy wa_conversations_update on public.wa_conversations
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (assigned_to = auth.uid() or public.wa_can_view_channel(channel_id))
  )
  with check (tenant_id = public.current_tenant_id());

drop policy if exists wa_messages_select on public.wa_conversation_messages;
create policy wa_messages_select on public.wa_conversation_messages
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.wa_conversations c
      where c.id = wa_conversation_messages.conversation_id
        and (c.assigned_to = auth.uid() or public.wa_can_view_channel(c.channel_id))
    )
  );

drop policy if exists wa_contacts_select on public.wa_contacts;
create policy wa_contacts_select on public.wa_contacts
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_in_role_group(auth.uid(), 'admin')
      or exists (
        select 1 from public.wa_conversations c
        where c.contact_id = wa_contacts.id
          and (c.assigned_to = auth.uid() or public.wa_can_view_channel(c.channel_id))
      )
    )
  );

-- ── Actualizar la vista enmascarada con la nueva visibilidad ─────────────────
create or replace view public.v_wa_contacts
  with (security_invoker = false) as
select
  c.id, c.tenant_id, c.wa_jid, c.display_name, c.instagram_handle, c.closer_creator_id,
  case when public.is_phone_privileged() then c.phone_e164 else public.mask_phone(c.phone_e164) end as phone,
  c.created_at, c.updated_at
from public.wa_contacts c
where c.tenant_id = public.current_tenant_id()
  and (
    public.is_in_role_group(auth.uid(), 'admin')
    or exists (
      select 1 from public.wa_conversations cv
      where cv.contact_id = c.id
        and (cv.assigned_to = auth.uid() or public.wa_can_view_channel(cv.channel_id))
    )
  );
grant select on public.v_wa_contacts to authenticated;
