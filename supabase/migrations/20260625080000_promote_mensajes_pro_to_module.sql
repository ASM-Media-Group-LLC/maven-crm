-- "Mensajes Pro" pasa de submódulo de Agency QA a MÓDULO top-level propio (Operaciones),
-- para poder asignarlo por rol sin dar todo Agency QA. Frontend: MODULES_CONFIG +
-- gate de /conversaciones (PermissionRoute) + entrada del sidebar pasan a module='Mensajes Pro'.
-- (1) Sembrar role_permissions (module='Mensajes Pro', submodule=null) con el acceso EFECTIVO
--     actual (explicit Agency QA/Mensajes Pro si existe, si no el nivel-módulo de Agency QA) →
--     nadie pierde la visibilidad que tenía. (admins hacen bypass y no necesitan fila).
insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select e.role_id, 'Mensajes Pro', null, e.has_access, e.scope
from (
  select rc.id as role_id,
    case
      when mp.role_id is not null then mp.can_access
      when aq.role_id is not null then aq.can_access
      else false
    end as has_access,
    coalesce(mp.data_scope, aq.data_scope, 'all') as scope
  from public.roles_config rc
  left join public.role_permissions mp on mp.role_id = rc.id and mp.module = 'Agency QA' and mp.submodule = 'Mensajes Pro'
  left join public.role_permissions aq on aq.role_id = rc.id and aq.module = 'Agency QA' and aq.submodule is null
  where mp.role_id is not null or aq.role_id is not null
) e
where not exists (
  select 1 from public.role_permissions x
  where x.role_id = e.role_id and x.module = 'Mensajes Pro' and x.submodule is null
);

-- (2) Borrar las filas viejas (Agency QA, Mensajes Pro) — el catálogo ya no las muestra.
delete from public.role_permissions where module = 'Agency QA' and submodule = 'Mensajes Pro';

-- (3) Predicado backend de BLU: honrar el módulo nuevo + seguir aceptando Chatters QA.
create or replace function public.can_use_blu_mp(p_uid uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select
    public.blu_is_management(p_uid)
    or exists (
      select 1
      from public.user_roles ur
      join public.roles_config rc on rc.name = ur.role
      join public.role_permissions rp on rp.role_id = rc.id
      where ur.user_id = p_uid
        and rp.can_access = true
        and (
          (rp.module = 'Mensajes Pro' and rp.submodule is null)
          or (rp.module = 'Agency QA' and rp.submodule = 'Chatters QA')
        )
    );
$function$;
