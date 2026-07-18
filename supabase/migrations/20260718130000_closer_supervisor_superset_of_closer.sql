-- =============================================================================
-- Alinear el rol 'Closer Supervisor' como SUPERSET real de 'closer'.
-- -----------------------------------------------------------------------------
-- Contexto: el código de los bots ya trata 'closer' y 'Closer Supervisor' como
-- sinónimos (send-report ROLE_SYNONYMS, whatsapp-agent get_team_ranking,
-- whatsapp-supervisor-tick usa whatsapp_user_schedules.role_kind) — comentario
-- textual: "Closer Supervisor es un superset de closer". PERO los role_permissions
-- se habían desincronizado: el supervisor NO tenía WhatsApp/Bandeja, Telegram,
-- Messenger, Cowork, Closers/Oportunidades, Teléfonos, Tickets/Calendario+Lista,
-- Eventos/Enlaces ni Creadores/Editar Blu CRM. Al promover un closer (Miguel) a
-- Closer Supervisor perdería esas herramientas de su trabajo diario.
--
-- Esta migración garantiza que para CADA permiso can_access=true del rol 'closer'
-- exista la misma fila (misma can_access + mismo data_scope) en 'Closer
-- Supervisor'. Preserva el data_scope de closer (p.ej. 'self' en WhatsApp/Telegram/
-- Teléfonos) para que el promovido siga operando como closer (ve lo suyo). Los
-- extras que ya tiene el supervisor (Ver Todas/Asignadas, Promolog, Exportar, Ver
-- Teléfonos, Agencias, etc.) se mantienen intactos.
--
-- Solo AGREGA/PRENDE; nunca quita. Idempotente. Reversible a mano si hiciera falta.
-- =============================================================================

-- 1) Prender filas del supervisor que estén en false pero closer tiene en true
--    (caso Cowork).
update public.role_permissions sup
set can_access = true
where sup.role_id = (select id from public.roles_config where name = 'Closer Supervisor' and is_active limit 1)
  and sup.can_access is distinct from true
  and exists (
    select 1
    from public.role_permissions cl
    join public.roles_config rc on rc.id = cl.role_id
    where rc.name = 'closer' and rc.is_active
      and cl.can_access = true
      and cl.module = sup.module
      and cl.submodule is not distinct from sup.submodule
  );

-- 2) Insertar las filas que el supervisor no tiene, copiando el data_scope de closer.
insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select (select id from public.roles_config where name = 'Closer Supervisor' and is_active limit 1),
       cl.module, cl.submodule, true, cl.data_scope
from public.role_permissions cl
join public.roles_config rc on rc.id = cl.role_id
where rc.name = 'closer' and rc.is_active
  and cl.can_access = true
  and not exists (
    select 1 from public.role_permissions sup
    where sup.role_id = (select id from public.roles_config where name = 'Closer Supervisor' and is_active limit 1)
      and sup.module = cl.module
      and sup.submodule is not distinct from cl.submodule
  );
