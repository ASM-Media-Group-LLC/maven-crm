-- CANDADOS DE JERARQUÍA EN POSICIONES (Alvaro, 26/11/2026). La estructura de la
-- empresa: Dueño arriba; nadie se da más poder del que tiene.
--
-- Decisiones (tanda de preguntas del 26/11):
--   1. Nadie cambia la Posición que él mismo ocupa; solo alguien de más arriba
--      (el Dueño).
--   2. Nadie asigna una posición con más permisos que los suyos
--      (ya existía: posicion_validar_delegacion).
--   3. Solo el Dueño crea admins o da la posición «Admin» (rol 'admin').
--   4. HR (y cualquiera que no sea el Dueño) solo asigna posiciones de abajo:
--      nunca una posición de mando (Usuarios o Roles) que él mismo tiene.
--      Las posiciones de horario (Jornada…) no son de mando: se siguen asignando.
--
-- Va en triggers (no reescribe las funciones del constructor): sirve igual para
-- posicion_guardar y persona_aplicar_accesos. Sin sesión (servidor, migraciones)
-- y el Dueño de la empresa no tienen candado.
--
-- Vuelta atrás:
--   drop trigger if exists posiciones_no_la_propia on public.posiciones_borrador;
--   drop trigger if exists posiciones_asignar_con_jerarquia on public.posiciones_borrador_personas;
--   drop function if exists public.posiciones_no_la_propia();
--   drop function if exists public.posiciones_asignar_con_jerarquia();
--   drop function if exists public.posicion_es_de_mando(public.posiciones_borrador);

create or replace function public.posicion_es_de_mando(_p public.posiciones_borrador)
returns boolean language sql immutable as $$
  select coalesce(_p.acceso_total, false)
      or coalesce(_p.rol, '') = 'admin'
      or coalesce(_p.checks->>'Administración|Usuarios', 'false') = 'true'
      or coalesce(_p.checks->>'Administración|Roles', 'false') = 'true'
$$;

-- 1. Nadie cambia la posición que ocupa.
create or replace function public.posiciones_no_la_propia()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid();
begin
  -- En un DELETE, NEW es null: devolverlo cancelaría el borrado. Se devuelve OLD.
  if actor is null then return case when tg_op = 'DELETE' then old else new end; end if;
  if exists (select 1 from public.tenant_owners o where o.user_id = actor and o.tenant_id = old.tenant_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from public.posiciones_borrador_personas a where a.posicion_id = old.id and a.user_id = actor) then
    raise exception 'No puedes cambiar la posición que tú mismo tienes: la cambia alguien de más arriba' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.posiciones_no_la_propia() from public, anon, authenticated;

drop trigger if exists posiciones_no_la_propia on public.posiciones_borrador;
create trigger posiciones_no_la_propia
  before update or delete on public.posiciones_borrador
  for each row execute function public.posiciones_no_la_propia();

-- 3 y 4. Asignar con jerarquía.
create or replace function public.posiciones_asignar_con_jerarquia()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); p public.posiciones_borrador;
begin
  if actor is null then return new; end if;
  -- Ya la tenía (el constructor re-inserta lo elegido con «on conflict do nothing»).
  if exists (select 1 from public.posiciones_borrador_personas a where a.user_id = new.user_id and a.posicion_id = new.posicion_id) then return new; end if;
  select * into p from public.posiciones_borrador where id = new.posicion_id;
  if p.id is null then return new; end if;
  if exists (select 1 from public.tenant_owners o where o.user_id = actor and o.tenant_id = p.tenant_id) then return new; end if;
  if coalesce(p.rol, '') = 'admin' or coalesce(p.acceso_total, false) then
    raise exception 'Solo el dueño puede dar la posición de Admin' using errcode = '42501';
  end if;
  if public.posicion_es_de_mando(p)
     and exists (select 1 from public.posiciones_borrador_personas a where a.posicion_id = p.id and a.user_id = actor) then
    raise exception 'Solo puedes asignar posiciones por debajo de la tuya' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.posiciones_asignar_con_jerarquia() from public, anon, authenticated;

drop trigger if exists posiciones_asignar_con_jerarquia on public.posiciones_borrador_personas;
create trigger posiciones_asignar_con_jerarquia
  before insert on public.posiciones_borrador_personas
  for each row execute function public.posiciones_asignar_con_jerarquia();
