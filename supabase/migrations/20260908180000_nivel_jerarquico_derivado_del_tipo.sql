-- EL NIVEL JERÁRQUICO SE DERIVA DEL TIPO DE ACCESO. Cuatro niveles, nada más:
--   empleado 20 < supervisor 50 < manager 80 < admin 100
-- Jhon (08/09): "para mí hay employee, supervisor, manager y admin". El número
-- (roles_config.level) es interno: lo usan can_manage_user / actor_level y el
-- alcance "subordinados". Hasta hoy vivía suelto del tipo y los roles nacían en
-- 10: Operations Sales tenía tipo manager y nivel 10. Desde acá el número sigue
-- al tipo solo, por trigger, y no se edita a mano.

create or replace function public.nivel_por_tipo(_is_admin boolean, _is_manager boolean, _is_supervisor boolean)
returns integer language sql immutable as $$
  select case when coalesce(_is_admin, false) then 100
              when coalesce(_is_manager, false) then 80
              when coalesce(_is_supervisor, false) then 50
              else 20 end;
$$;

create or replace function public.tg_role_groups_sync_level()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.roles_config
     set level = public.nivel_por_tipo(new.is_admin, new.is_manager_or_above, new.is_supervisor_or_above)
   where name = new.role_name;
  return new;
end $$;

drop trigger if exists trg_role_groups_sync_level on public.role_groups;
create trigger trg_role_groups_sync_level
  after insert or update of is_admin, is_manager_or_above, is_supervisor_or_above
  on public.role_groups
  for each row execute function public.tg_role_groups_sync_level();

-- Un rol nuevo nace empleado, no "10" (que quedaba por debajo de todo).
alter table public.roles_config alter column level set default 20;

-- Backfill: cada rol al nivel de su tipo. HHRR se EXCLUYE a propósito: hoy está
-- en 90 (por encima de las managers) con tipo supervisor; bajarlo le quita la
-- gestión de usuarios sobre managers. Lo decide Jhon cambiándole el tipo.
update public.roles_config rc
   set level = public.nivel_por_tipo(rg.is_admin, rg.is_manager_or_above, rg.is_supervisor_or_above)
  from public.role_groups rg
 where rg.role_name = rc.name
   and rc.name <> 'HHRR'
   and rc.level is distinct from public.nivel_por_tipo(rg.is_admin, rg.is_manager_or_above, rg.is_supervisor_or_above);
