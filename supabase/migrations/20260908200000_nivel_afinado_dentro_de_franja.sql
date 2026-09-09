-- EL TIPO DEFINE LA FRANJA; EL NÚMERO AFINA DENTRO DE ELLA (Jhon, 08/09 21:3x).
--   empleado 20-49 · supervisor 50-79 · management 80-99 · admin 100
-- "Subordinado" sigue siendo nivel estrictamente menor, así que dos roles del
-- mismo tipo pueden ordenarse entre sí (HHRR 85 ve las salas de un Management
-- en 80) sin que un supervisor pueda quedar jamás por encima de un management.
-- Cambiar el TIPO resetea el número a la base de la franja nueva; guardar el
-- rol sin cambiar el tipo NO lo toca (antes el trigger pisaba cualquier ajuste
-- en cada guardado, porque el front re-upserta los flags siempre).

create or replace function public.franja_de_tipo(_is_admin boolean, _is_manager boolean, _is_supervisor boolean)
returns int[] language sql immutable as $$
  select case when coalesce(_is_admin, false) then array[100, 100]
              when coalesce(_is_manager, false) then array[80, 99]
              when coalesce(_is_supervisor, false) then array[50, 79]
              else array[20, 49] end;
$$;

create or replace function public.tg_role_groups_sync_level()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT'
     or public.nivel_por_tipo(old.is_admin, old.is_manager_or_above, old.is_supervisor_or_above)
        is distinct from public.nivel_por_tipo(new.is_admin, new.is_manager_or_above, new.is_supervisor_or_above)
  then
    update public.roles_config
       set level = public.nivel_por_tipo(new.is_admin, new.is_manager_or_above, new.is_supervisor_or_above)
     where name = new.role_name;
  end if;
  return new;
end $$;

-- El número no puede salirse de la franja de su tipo.
create or replace function public.tg_roles_config_level_en_franja()
returns trigger language plpgsql security definer set search_path = public as $$
declare f int[];
begin
  select public.franja_de_tipo(rg.is_admin, rg.is_manager_or_above, rg.is_supervisor_or_above)
    into f from public.role_groups rg where rg.role_name = new.name;
  if f is not null and (new.level < f[1] or new.level > f[2]) then
    raise exception 'El nivel % está fuera de la franja de su tipo (%–%).', new.level, f[1], f[2]
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_roles_config_level_en_franja on public.roles_config;
create trigger trg_roles_config_level_en_franja
  before update of level on public.roles_config
  for each row execute function public.tg_roles_config_level_en_franja();
