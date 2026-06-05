-- Bandeja estricta + la conversación sigue al dueño del lead.
--
-- Antes (20260604170000): el closer veía SUS asignadas + la cola SIN asignar de sus
-- canales (wa_can_view_channel). El dueño pidió que cada closer vea SOLO lo asignado
-- a él (igual que los demás), y que la conversación siga al dueño del lead.
--
-- Acá:
--   1) RLS estricta (SELECT): non-supervisor ve SOLO assigned_to = él. Saca la cláusula
--      "assigned_to is null AND wa_can_view_channel(...)". Supervisor/manager/admin ven todo.
--      Idéntico criterio en wa_conversation_messages y wa_contacts.
--   2) Trigger: al cambiar el dueño del lead (tomar/reasignar en closer_creators), sus
--      conversaciones lo siguen (se reasignan al nuevo dueño; si queda sin dueño, sin asignar).
--   3) Backfill: conversaciones SIN asignar cuyo contacto YA está ligado a un lead con
--      dueño → se asignan a ese dueño (para que no desaparezcan de su bandeja). Las no
--      ligadas quedan sin asignar = triaje del supervisor.
--
-- El botón (wa-inbox-open) ya quedó gateado por dueño del lead + auto-asigna al abrir.
-- El bot (whatsapp-agent / ingest / supervisor-tick) corre con service_role → NO lo
-- afecta esta RLS (solo aplica al rol `authenticated` del browser).

-- ── 1) RLS estricta ──────────────────────────────────────────────────────────
drop policy if exists wa_conversations_select on public.wa_conversations;
create policy wa_conversations_select on public.wa_conversations
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_in_role_group(auth.uid(), 'supervisor_or_above')
      or assigned_to = auth.uid()
    )
  );

drop policy if exists wa_messages_select on public.wa_conversation_messages;
create policy wa_messages_select on public.wa_conversation_messages
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.wa_conversations c
      where c.id = wa_conversation_messages.conversation_id
        and (
          public.is_in_role_group(auth.uid(), 'supervisor_or_above')
          or c.assigned_to = auth.uid()
        )
    )
  );

drop policy if exists wa_contacts_select on public.wa_contacts;
create policy wa_contacts_select on public.wa_contacts
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_in_role_group(auth.uid(), 'supervisor_or_above')
      or exists (
        select 1 from public.wa_conversations c
        where c.contact_id = wa_contacts.id
          and c.assigned_to = auth.uid()
      )
    )
  );

-- ── 2) La conversación sigue al dueño del lead (al tomar/reasignar) ───────────
create or replace function public.wa_sync_conv_on_lead_owner_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is distinct from old.assigned_to then
    update public.wa_conversations wc
       set assigned_to = new.assigned_to
      from public.wa_contacts ct
     where ct.closer_creator_id = new.id
       and wc.contact_id = ct.id
       and wc.assigned_to is distinct from new.assigned_to;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wa_sync_conv_on_lead_owner_change on public.closer_creators;
create trigger trg_wa_sync_conv_on_lead_owner_change
  after update of assigned_to on public.closer_creators
  for each row execute function public.wa_sync_conv_on_lead_owner_change();

-- ── 3) Backfill: conversaciones sin asignar de contactos ya ligados a un lead con dueño
update public.wa_conversations wc
   set assigned_to = cc.assigned_to
  from public.wa_contacts ct
  join public.closer_creators cc on cc.id = ct.closer_creator_id
 where wc.contact_id = ct.id
   and wc.assigned_to is null
   and cc.assigned_to is not null;
