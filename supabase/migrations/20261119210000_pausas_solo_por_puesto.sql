-- TODO POR PUESTO, NADA A MANO (Alvaro, 19/11/2026: «Nada puede estar a mano,
-- todo tiene que estar en la parte de roles… para podérsela vender a otras
-- empresas»). Se quita la pausa por persona (pausas_persona): si alguien
-- necesita otra pausa, se le cambia el puesto. Lo que es de toda la empresa
-- (hoy, las modalidades de pausa) se administra en Ajustes → Empresa, y entra
-- quien tenga la función del puesto N:empresa.configurar (hoy dueño y Admin).

set check_function_bodies = off;

-- Quién configura la empresa: el dueño o quien tenga la función en su puesto.
create or replace function public.puedo_configurar_empresa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_dueno((select auth.uid())) or public.tiene_funcion((select auth.uid()), 'N:empresa.configurar');
$$;
revoke all on function public.puedo_configurar_empresa() from public, anon;
grant execute on function public.puedo_configurar_empresa() to authenticated;

-- La pausa de cada persona sale SOLO de su puesto (la mayor si tiene varios);
-- sin puesto con modalidad, lo de antes (roles_config) o 30 + 10.
create or replace function public.argos_pausas_de(_uid uuid)
returns table (modalidad_id uuid, nombre text, comida_min integer, bano_min integer, origen text)
language sql
stable
security definer
set search_path = public
as $$
  select x.modalidad_id, x.nombre, x.comida_min, x.bano_min, x.origen from (
    select m.id as modalidad_id, m.nombre, m.comida_min, m.bano_min, 'puesto'::text as origen, 1 as prioridad, m.comida_min + m.bano_min as total
      from public.posiciones_borrador_personas bp
      join public.posiciones_borrador pb on pb.id = bp.posicion_id and pb.activa
      join public.pausas_modalidades m on m.id = pb.modalidad_id
     where bp.user_id = _uid
    union all
    select null, null, coalesce(p.comida_min, r.comida, 30), coalesce(p.bano_min, r.bano, 10), 'base', 2, 0
      from public.profiles p
      left join lateral (
        select max(c.comida_min) as comida, max(c.bano_min) as bano
          from public.user_roles ur
          join public.roles_config c on lower(c.name) = lower(ur.role) and c.is_active
                                    and (c.tenant_id = ur.tenant_id or ur.tenant_id is null)
         where ur.user_id = p.id
      ) r on true
     where p.id = _uid
  ) x
  order by x.prioridad, x.total desc
  limit 1;
$$;

create or replace function public.pausas_modalidades_de_mi_empresa()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'puede_editar', public.puedo_configurar_empresa(),
    'modalidades', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'nombre', m.nombre, 'comida_min', m.comida_min, 'bano_min', m.bano_min, 'activa', m.activa,
        'puestos', (select count(*) from public.posiciones_borrador pb where pb.modalidad_id = m.id),
        'personas', (select count(distinct bp.user_id) from public.posiciones_borrador pb
                       join public.posiciones_borrador_personas bp on bp.posicion_id = pb.id
                      where pb.modalidad_id = m.id))
      order by m.orden, m.nombre)
      from public.pausas_modalidades m where m.tenant_id = public.empresa_de((select auth.uid()))), '[]'::jsonb));
$$;

create or replace function public.pausas_modalidad_guardar(_id uuid, _nombre text, _comida integer, _bano integer, _activa boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  emp uuid := public.empresa_de((select auth.uid()));
  v_id uuid;
begin
  if not public.puedo_configurar_empresa() then
    raise exception 'sin permiso para configurar la empresa' using errcode = '42501';
  end if;
  if emp is null then raise exception 'sin empresa' using errcode = '42501'; end if;
  if _id is null then
    insert into public.pausas_modalidades (tenant_id, nombre, comida_min, bano_min, activa, orden)
    values (emp, btrim(_nombre), _comida, _bano, coalesce(_activa, true),
            coalesce((select max(orden) + 1 from public.pausas_modalidades where tenant_id = emp), 1))
    returning id into v_id;
  else
    update public.pausas_modalidades
       set nombre = btrim(_nombre), comida_min = _comida, bano_min = _bano, activa = coalesce(_activa, true), updated_at = now()
     where id = _id and tenant_id = emp
    returning id into v_id;
    if v_id is null then raise exception 'no encontrada' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end
$$;

-- La pausa de cada persona, para verla junto a su horario (solo lectura).
drop function if exists public.pausas_del_equipo();
create function public.pausas_del_equipo()
returns table (user_id uuid, modalidad_id uuid, modalidad text, comida_min integer, bano_min integer, origen text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, x.modalidad_id, x.nombre, x.comida_min, x.bano_min, x.origen
    from public.profiles p
    cross join lateral public.argos_pausas_de(p.id) x
   where p.deleted_at is null and public.puede_editar_horario(p.id);
$$;
revoke all on function public.pausas_del_equipo() from public, anon;
grant execute on function public.pausas_del_equipo() to authenticated;

-- Fuera la pausa por persona.
drop function if exists public.pausas_asignar(uuid, uuid);
drop table if exists public.pausas_persona;

-- La función de puesto nueva: Admin configura la empresa (en vez de N:pausas.modalidades).
do $pos$ begin
  if to_regclass('public.posiciones_borrador') is not null then
    update public.posiciones_borrador
       set checks = (checks - 'N:pausas.modalidades') || '{"N:empresa.configurar": true}'::jsonb, updated_at = now()
     where nombre = 'Admin';
    update public.posiciones_borrador
       set checks = checks - 'N:pausas.modalidades', updated_at = now()
     where checks ? 'N:pausas.modalidades' and nombre <> 'Admin';
  end if;
end $pos$;
