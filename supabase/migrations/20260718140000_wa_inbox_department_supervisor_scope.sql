-- =============================================================================
-- Bandeja WhatsApp: un "supervisor de departamento" ve TODAS las conversaciones
-- de SU departamento (no solo las suyas), pero acotado a ese departamento.
-- -----------------------------------------------------------------------------
-- Pedido del owner: "como Closer Supervisor puede ver todo en WhatsApp pero de
-- los closer". Hoy toda la bandeja es department='closer' (476 convos, 7 canales
-- closer). La visibilidad era binaria: has_wa_inbox_global_scope() (admin, o
-- supervisor_or_above SIN fila WhatsApp data_scope='self') = TODO; si no, solo
-- assigned/co-asignado. A Miguel le dejamos data_scope='self' (opera como closer),
-- así que sin esto vería solo lo suyo.
--
-- En vez de darle scope GLOBAL (vería también depto manager/recruitment a futuro),
-- agregamos una regla POR DEPARTAMENTO: wa_supervises_department(uid, dept). Un
-- Closer Supervisor supervisa el depto 'closer'. Se suma como OR a las policies
-- SELECT de la bandeja → es ADITIVO (no le quita acceso a nadie; solo concede al
-- rol supervisor de ese depto). data_scope='self' se mantiene (no scope global).
--
-- Como NINGÚN usuario tiene el rol 'Closer Supervisor' todavía, el efecto es cero
-- hasta que se asigne (p.ej. Miguel). Reversible (drop función + revertir ALTERs).
-- =============================================================================

create or replace function public.wa_supervises_department(_user_id uuid, _dept text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id
      and (
        (ur.role = 'Closer Supervisor' and _dept = 'closer')
        -- futuros supervisores de depto se agregan acá (p.ej. Chatter Supervisor)
      )
  );
$$;
comment on function public.wa_supervises_department(uuid, text) is
  'TRUE si el rol del user supervisa el departamento _dept de la bandeja WhatsApp (Closer Supervisor → closer). Usado como OR aditivo en las policies SELECT de wa_* para dar visibilidad de todo el depto sin scope global.';

-- 1) Conversaciones: ver las del depto que supervisa.
alter policy wa_conversations_select on public.wa_conversations
using (
  (tenant_id = current_tenant_id())
  and (
    has_wa_inbox_global_scope(auth.uid())
    or (assigned_to = auth.uid())
    or is_wa_assignee(id, auth.uid())
    or wa_supervises_department(auth.uid(), department)
  )
);

-- 2) Mensajes: ver los de conversaciones del depto que supervisa.
alter policy wa_messages_select on public.wa_conversation_messages
using (
  (tenant_id = current_tenant_id())
  and exists (
    select 1 from public.wa_conversations c
    where c.id = wa_conversation_messages.conversation_id
      and (
        has_wa_inbox_global_scope(auth.uid())
        or c.assigned_to = auth.uid()
        or is_wa_assignee(c.id, auth.uid())
        or wa_supervises_department(auth.uid(), c.department)
      )
  )
);

-- 3) Asignados (chips): ver quién atiende las convos del depto que supervisa.
alter policy wa_conv_assignees_select on public.wa_conversation_assignees
using (
  has_wa_inbox_global_scope(auth.uid())
  or (user_id = auth.uid())
  or is_wa_assignee(conversation_id, auth.uid())
  or exists (
    select 1 from public.wa_conversations c
    where c.id = wa_conversation_assignees.conversation_id
      and wa_supervises_department(auth.uid(), c.department)
  )
);

-- 4) Contactos: ver nombre/handle de los contactos de las convos del depto.
alter policy wa_contacts_select on public.wa_contacts
using (
  (tenant_id = current_tenant_id())
  and (
    has_wa_inbox_global_scope(auth.uid())
    or exists (
      select 1 from public.wa_conversations c
      where c.contact_id = wa_contacts.id
        and (
          c.assigned_to = auth.uid()
          or is_wa_assignee(c.id, auth.uid())
          or wa_supervises_department(auth.uid(), c.department)
        )
    )
  )
);
