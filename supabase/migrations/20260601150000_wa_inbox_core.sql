-- =============================================================================
-- WhatsApp Inbox — núcleo de conversación (Slice 1)
-- -----------------------------------------------------------------------------
-- Tres tablas GENÉRICAS (contacto -> conversación -> mensaje) para una bandeja de
-- WhatsApp DENTRO de Maven. v1 = módulo closers, pero el modelo es genérico
-- (columna `department`) para que managers/reclutamiento enchufen después sin
-- reescribir.
--
-- Seguridad (desde el inicio):
--   · RLS: el closer ve SOLO sus conversaciones asignadas; admin/manager/
--     supervisor ven todo el tenant. La escritura no tiene policy para
--     `authenticated` -> solo service_role (las edge functions mantienen
--     Evolution en sync + idempotencia por external_id).
--   · El teléfono vive en wa_contacts.phone_e164, pero se REVOCA a nivel columna
--     para authenticated/anon. El front usa la vista `v_wa_contacts`, que
--     enmascara salvo is_phone_privileged() (admin/service_role). Reusa la
--     fundación de masking (mask_phone / is_phone_privileged).
--   · Realtime habilitado en conversaciones + mensajes (bandeja en vivo).
--
-- Reusa convenciones existentes: current_tenant_id(), update_updated_at_column(),
-- has_role(), mask_phone(), is_phone_privileged().
-- Additive: NO toca tablas existentes. Reversible.
-- =============================================================================

-- ── Helper: ¿el caller ve TODAS las conversaciones del tenant? ────────────────
-- admin / manager / supervisor ven todo; el resto (closer, etc.) solo lo suyo.
create or replace function public.wa_inbox_can_see_all()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'manager')
      or public.has_role(auth.uid(), 'supervisor');
$$;
grant execute on function public.wa_inbox_can_see_all() to authenticated, service_role;

-- ── wa_contacts ───────────────────────────────────────────────────────────────
create table if not exists public.wa_contacts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default public.current_tenant_id(),
  wa_jid            text not null,                 -- "<phone>@s.whatsapp.net" | "<lid>@lid"
  phone_e164        text,                          -- PRIVILEGIADO (ver v_wa_contacts)
  display_name      text,                          -- lo que ve el closer (nombre / @handle)
  instagram_handle  text,
  closer_creator_id uuid references public.closer_creators(id) on delete set null, -- contexto del pipeline
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, wa_jid)
);
comment on table public.wa_contacts is 'Inbox WA: persona del otro lado (lead/creadora). phone_e164 es PRIVILEGIADO (solo admin/service_role; el front usa v_wa_contacts).';
comment on column public.wa_contacts.phone_e164 is 'Número crudo. REVOCADO a authenticated/anon a nivel columna; acceso enmascarado vía v_wa_contacts.';
create index if not exists wa_contacts_creator_idx on public.wa_contacts (closer_creator_id);

-- ── wa_conversations ──────────────────────────────────────────────────────────
create table if not exists public.wa_conversations (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null default public.current_tenant_id(),
  contact_id           uuid not null references public.wa_contacts(id) on delete cascade,
  channel_jid          text,                       -- línea de empresa que "posee" el hilo (uno-por-closer)
  department           text not null default 'closer' check (department in ('closer','manager','recruitment')),
  assigned_to          uuid references auth.users(id) on delete set null,
  status               text not null default 'open' check (status in ('open','pending','closed')),
  last_message_at      timestamptz,
  last_message_preview text,
  unread_count         integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table public.wa_conversations is 'Inbox WA: hilo entre una línea de empresa (channel_jid) y un contacto. assigned_to = closer que la atiende.';
create index if not exists wa_conversations_assigned_idx   on public.wa_conversations (tenant_id, assigned_to, last_message_at desc nulls last);
create index if not exists wa_conversations_dept_status_idx on public.wa_conversations (tenant_id, department, status, last_message_at desc nulls last);
create index if not exists wa_conversations_contact_idx     on public.wa_conversations (contact_id);

-- ── wa_conversation_messages ──────────────────────────────────────────────────
create table if not exists public.wa_conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.current_tenant_id(),
  conversation_id uuid not null references public.wa_conversations(id) on delete cascade,
  direction       text not null check (direction in ('in','out')),
  sender_user_id  uuid references auth.users(id) on delete set null, -- closer que mandó el saliente; null si entrante
  external_id     text,                            -- id del mensaje en Evolution -> idempotencia
  body            text,
  msg_type        text not null default 'text' check (msg_type in ('text','audio','image','video','document','sticker','system')),
  media_url       text,
  status          text not null default 'sent' check (status in ('sent','delivered','read','failed')),
  is_ai_assisted  boolean not null default false,
  sent_at         timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (conversation_id, external_id)            -- NULLs son distintos en PG: no bloquea salientes sin id aún
);
comment on table public.wa_conversation_messages is 'Inbox WA: cada mensaje de una conversación. external_id = id en Evolution (idempotencia). Escritura solo service_role.';
create index if not exists wa_messages_conversation_idx on public.wa_conversation_messages (conversation_id, sent_at);

-- ── updated_at triggers ─────────────────────────────────────────────────────-
create trigger wa_contacts_set_updated_at
  before update on public.wa_contacts
  for each row execute function public.update_updated_at_column();
create trigger wa_conversations_set_updated_at
  before update on public.wa_conversations
  for each row execute function public.update_updated_at_column();

-- ── RLS ─────────────────────────────────────────────────────────────────────-
alter table public.wa_contacts              enable row level security;
alter table public.wa_conversations         enable row level security;
alter table public.wa_conversation_messages enable row level security;

-- wa_conversations: closer ve lo suyo; admin/manager/supervisor ve todo.
create policy wa_conversations_select on public.wa_conversations
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (assigned_to = auth.uid() or public.wa_inbox_can_see_all())
  );
create policy wa_conversations_update on public.wa_conversations
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (assigned_to = auth.uid() or public.wa_inbox_can_see_all())
  )
  with check (tenant_id = public.current_tenant_id());
-- INSERT/DELETE: sin policy -> solo service_role (edge functions).

-- wa_conversation_messages: visibles si la conversación es visible para el caller.
create policy wa_messages_select on public.wa_conversation_messages
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.wa_conversations c
      where c.id = wa_conversation_messages.conversation_id
        and (c.assigned_to = auth.uid() or public.wa_inbox_can_see_all())
    )
  );
-- INSERT/UPDATE/DELETE: sin policy -> solo service_role (whatsapp-send / ingest).

-- wa_contacts: visible si el caller ve alguna conversación con ese contacto, o es supervisor+.
create policy wa_contacts_select on public.wa_contacts
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.wa_inbox_can_see_all()
      or exists (
        select 1 from public.wa_conversations c
        where c.contact_id = wa_contacts.id and c.assigned_to = auth.uid()
      )
    )
  );

-- ── Masking del teléfono (server-side real) ───────────────────────────────────
-- Quitar el SELECT de tabla completa y re-otorgar TODAS las columnas MENOS
-- phone_e164. service_role NO se toca (conserva acceso completo para enrutar a
-- Evolution).
revoke select on public.wa_contacts from authenticated, anon;
grant select (id, tenant_id, wa_jid, display_name, instagram_handle, closer_creator_id, created_at, updated_at)
  on public.wa_contacts to authenticated;

-- Vista enmascarada: número completo solo si is_phone_privileged() (admin /
-- service_role), sino enmascarado. SECURITY DEFINER (security_invoker=false) para
-- poder leer la columna revocada y enmascararla; como omite la RLS de la tabla
-- base, replica el filtro de visibilidad en el WHERE.
create or replace view public.v_wa_contacts
  with (security_invoker = false) as
select
  c.id, c.tenant_id, c.wa_jid, c.display_name, c.instagram_handle, c.closer_creator_id,
  case when public.is_phone_privileged() then c.phone_e164 else public.mask_phone(c.phone_e164) end as phone,
  c.created_at, c.updated_at
from public.wa_contacts c
where c.tenant_id = public.current_tenant_id()
  and (
    public.wa_inbox_can_see_all()
    or exists (
      select 1 from public.wa_conversations cv
      where cv.contact_id = c.id and cv.assigned_to = auth.uid()
    )
  );
grant select on public.v_wa_contacts to authenticated;
comment on view public.v_wa_contacts is 'Contactos del inbox con teléfono enmascarado (full solo admin/service_role vía is_phone_privileged). Usar ESTA vista desde el front, nunca wa_contacts.phone_e164.';

-- ── Realtime (bandeja en vivo) ────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.wa_conversations;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.wa_conversation_messages;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
