-- Listas/etiquetas PERSONALES por usuario para la bandeja de WhatsApp (estilo WhatsApp:
-- cada uno arma sus propias listas y solo ve las suyas).
create table if not exists public.wa_labels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  user_id uuid not null default auth.uid(),
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_wa_labels_user on public.wa_labels (user_id);
alter table public.wa_labels enable row level security;

-- El usuario solo ve/gestiona SUS listas.
drop policy if exists wa_labels_own on public.wa_labels;
create policy wa_labels_own on public.wa_labels
  for all to authenticated
  using (tenant_id = current_tenant_id() and user_id = auth.uid())
  with check (tenant_id = current_tenant_id() and user_id = auth.uid());

-- Join chat <-> lista. La lista es personal, así que la fila es "yo metí este chat en mi lista".
create table if not exists public.wa_conversation_labels (
  conversation_id uuid not null references public.wa_conversations(id) on delete cascade,
  label_id uuid not null references public.wa_labels(id) on delete cascade,
  tenant_id uuid not null default current_tenant_id(),
  created_at timestamptz not null default now(),
  primary key (conversation_id, label_id)
);
create index if not exists idx_wcl_label on public.wa_conversation_labels (label_id);
alter table public.wa_conversation_labels enable row level security;

-- Ver/poner/quitar: la lista tiene que ser MÍA + tener acceso a la conversación
-- (asignado o supervisor+), mismo criterio que el resto de la bandeja.
drop policy if exists wcl_own on public.wa_conversation_labels;
create policy wcl_own on public.wa_conversation_labels
  for all to authenticated
  using (
    tenant_id = current_tenant_id()
    and exists (select 1 from public.wa_labels l where l.id = label_id and l.user_id = auth.uid())
  )
  with check (
    tenant_id = current_tenant_id()
    and exists (select 1 from public.wa_labels l where l.id = label_id and l.user_id = auth.uid())
    and exists (
      select 1 from public.wa_conversations c
      where c.id = conversation_id and c.tenant_id = current_tenant_id()
        and (is_in_role_group(auth.uid(), 'supervisor_or_above') or c.assigned_to = auth.uid())
    )
  );
