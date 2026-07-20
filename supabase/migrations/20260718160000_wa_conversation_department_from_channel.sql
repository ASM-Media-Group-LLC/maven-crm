-- =============================================================================
-- wa_conversations.department debe reflejar el departamento de su LÍNEA (canal).
-- -----------------------------------------------------------------------------
-- Reporte de Jhon (2026-07-18): Miguel (Closer Supervisor) veía también las
-- conversaciones de la línea "Managers". La visibilidad por departamento
-- (wa_supervises_department, PR #893) mira wa_conversations.department, pero
-- whatsapp-ingest HARDCODEABA department='closer' al crear conversaciones →
-- 46 conversaciones de la línea Managers (canal department='manager') quedaron
-- grabadas como 'closer' y el supervisor de closers las veía.
--
-- Fix en 3 partes:
--   1) whatsapp-ingest ahora deriva department del canal (mismo whitelist que
--      wa-inbox-open) — en este mismo PR.
--   2) BACKFILL: alinear las conversaciones existentes al departamento de su
--      canal (solo las que difieren; las sin canal no se tocan).
--   3) Trigger BEFORE INSERT: cualquier writer futuro (ingest viejo, scripts)
--      queda corregido en la BD → el drift no puede volver.
--
-- Efectos de visibilidad del backfill: los asignados/co-asignados a esas 46
-- siguen viéndolas (la RLS chequea assigned/asignee primero); admin y scope
-- global también. Solo dejan de verlas los supervisores POR DEPARTAMENTO de
-- otro depto (Miguel) — que es exactamente lo pedido.
-- =============================================================================

-- 3) Trigger anti-drift (primero, así el backfill y el trigger quedan atómicos
--    en la misma migración).
create or replace function public.sync_wa_conversation_department()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept text;
begin
  if new.channel_id is not null then
    select department into v_dept from public.wa_channels where id = new.channel_id;
    if v_dept in ('closer', 'manager', 'recruitment') then
      new.department := v_dept;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_wa_conversation_department on public.wa_conversations;
create trigger trg_sync_wa_conversation_department
before insert on public.wa_conversations
for each row execute function public.sync_wa_conversation_department();

-- 2) Backfill: alinear conversaciones existentes al departamento de su canal.
update public.wa_conversations c
set department = ch.department
from public.wa_channels ch
where ch.id = c.channel_id
  and ch.department in ('closer', 'manager', 'recruitment')
  and c.department is distinct from ch.department;
