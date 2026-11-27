-- HORA DE COMIDA (Alvaro, 27/11/2026). Cada plan de pausa (Ajustes → Empresa →
-- Planes de pausa) puede traer una HORA de comida, y cada empresa decide qué tan
-- estricta es:
--   · Recomendada (interruptor apagado): a esa hora Maven le recuerda a la
--     persona que es su hora de comer; si come en otro momento, no pasa nada.
--     Así lo quiere Kash.
--   · Obligatoria (interruptor prendido): tiene un margen (por defecto 15 min,
--     la empresa lo cambia; 0 = exacta). Si sale a comer fuera del margen,
--     Argos lo anota como aviso (amarillo), sin descontar nada.
-- En el horario de cada persona, RR. HH. puede ponerle otra hora (ajuste por
-- persona). Todo sale de los roles: el plan lo edita quien tiene
-- N:empresa.configurar (puedo_configurar_empresa) y la hora por persona quien
-- puede editar su horario (puede_editar_horario: N:horarios.gestionar). Nada
-- escrito a mano en el código.
--
-- Arranca SIN hora en ningún plan: nada cambia hasta que la empresa la ponga.
--
-- Vuelta atrás:
--   drop function if exists public.comida_fuera_de_hora(uuid, date);
--   drop function if exists public.comidas_del_equipo();
--   drop function if exists public.mi_comida();
--   drop function if exists public.comida_de(uuid);
--   drop function if exists public.comida_persona_guardar(uuid, time);
--   drop table if exists public.horario_comida;
--   (y volver a crear pausas_modalidad_guardar(uuid,text,int,int,boolean) y
--    pausas_modalidades_de_mi_empresa() como en 20261119…)
--   alter table public.pausas_modalidades drop column if exists comida_hora,
--     drop column if exists comida_obligatoria, drop column if exists comida_margen_min;

alter table public.pausas_modalidades
  add column if not exists comida_hora time,
  add column if not exists comida_obligatoria boolean not null default false,
  add column if not exists comida_margen_min integer not null default 15
    check (comida_margen_min between 0 and 240);

-- Ajuste por persona (lo pone RR. HH. en su horario).
create table if not exists public.horario_comida (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  hora time not null,
  actualizado_at timestamptz not null default now(),
  actualizado_por uuid references public.profiles(id) on delete set null
);
alter table public.horario_comida enable row level security;
drop policy if exists horario_comida_ver on public.horario_comida;
create policy horario_comida_ver on public.horario_comida for select to authenticated
  using (user_id = (select auth.uid()) or public.puede_editar_horario(user_id));
-- Se escribe solo por comida_persona_guardar (security definer).

-- Guardar un plan: mismos permisos de siempre, ahora con la hora.
drop function if exists public.pausas_modalidad_guardar(uuid, text, integer, integer, boolean);
create or replace function public.pausas_modalidad_guardar(
  _id uuid, _nombre text, _comida integer, _bano integer, _activa boolean default true,
  _hora time default null, _obligatoria boolean default false, _margen integer default 15)
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
    insert into public.pausas_modalidades (tenant_id, nombre, comida_min, bano_min, activa, orden,
                                           comida_hora, comida_obligatoria, comida_margen_min)
    values (emp, btrim(_nombre), _comida, _bano, coalesce(_activa, true),
            coalesce((select max(orden) + 1 from public.pausas_modalidades where tenant_id = emp), 1),
            _hora, coalesce(_obligatoria, false), greatest(0, least(240, coalesce(_margen, 15))))
    returning id into v_id;
  else
    update public.pausas_modalidades
       set nombre = btrim(_nombre), comida_min = _comida, bano_min = _bano, activa = coalesce(_activa, true),
           comida_hora = _hora, comida_obligatoria = coalesce(_obligatoria, false),
           comida_margen_min = greatest(0, least(240, coalesce(_margen, 15))), updated_at = now()
     where id = _id and tenant_id = emp
    returning id into v_id;
    if v_id is null then raise exception 'no encontrada' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.pausas_modalidad_guardar(uuid, text, integer, integer, boolean, time, boolean, integer) from public, anon;
grant execute on function public.pausas_modalidad_guardar(uuid, text, integer, integer, boolean, time, boolean, integer) to authenticated;

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
        'comida_hora', to_char(m.comida_hora, 'HH24:MI'), 'comida_obligatoria', m.comida_obligatoria,
        'comida_margen_min', m.comida_margen_min,
        'puestos', (select count(*) from public.posiciones_borrador pb where pb.modalidad_id = m.id),
        'personas', (select count(distinct bp.user_id) from public.posiciones_borrador pb
                       join public.posiciones_borrador_personas bp on bp.posicion_id = pb.id
                      where pb.modalidad_id = m.id))
      order by m.orden, m.nombre)
      from public.pausas_modalidades m where m.tenant_id = public.empresa_de((select auth.uid()))), '[]'::jsonb));
$$;

-- La hora de comida de una persona: la suya (ajuste) o la de su plan.
create or replace function public.comida_de(_uid uuid)
returns table (hora time, obligatoria boolean, margen_min integer, origen text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(hc.hora, m.comida_hora),
         coalesce(m.comida_obligatoria, false),
         coalesce(m.comida_margen_min, 15),
         case when hc.hora is not null then 'persona' when m.comida_hora is not null then 'plan' else 'ninguna' end
    from (select _uid as uid) u
    left join lateral public.argos_pausas_de(_uid) ap on true
    left join public.pausas_modalidades m on m.id = ap.modalidad_id
    left join public.horario_comida hc on hc.user_id = _uid;
$$;
revoke all on function public.comida_de(uuid) from public, anon, authenticated;

create or replace function public.mi_comida()
returns table (hora text, obligatoria boolean, margen_min integer, origen text)
language sql
stable
security definer
set search_path = public
as $$
  select to_char(c.hora, 'HH24:MI'), c.obligatoria, c.margen_min, c.origen
    from public.comida_de((select auth.uid())) c;
$$;
revoke all on function public.mi_comida() from public, anon;
grant execute on function public.mi_comida() to authenticated;

-- Para la lista de horarios de RR. HH.: misma regla de quién ve a quién.
create or replace function public.comidas_del_equipo()
returns table (user_id uuid, hora text, obligatoria boolean, margen_min integer, origen text, hora_plan text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, to_char(c.hora, 'HH24:MI'), c.obligatoria, c.margen_min, c.origen,
         to_char((select m.comida_hora from public.argos_pausas_de(p.id) ap
                    join public.pausas_modalidades m on m.id = ap.modalidad_id), 'HH24:MI')
    from public.profiles p
    cross join lateral public.comida_de(p.id) c
   where p.deleted_at is null and public.puede_editar_horario(p.id);
$$;
revoke all on function public.comidas_del_equipo() from public, anon;
grant execute on function public.comidas_del_equipo() to authenticated;

-- RR. HH. le pone (o le quita, con null) una hora propia a una persona.
create or replace function public.comida_persona_guardar(_uid uuid, _hora time)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puede_editar_horario(_uid) then
    raise exception 'sin permiso para cambiar el horario de esta persona' using errcode = '42501';
  end if;
  if _hora is null then
    delete from public.horario_comida where user_id = _uid;
  else
    insert into public.horario_comida (user_id, hora, actualizado_at, actualizado_por)
    values (_uid, _hora, now(), (select auth.uid()))
    on conflict (user_id) do update set hora = excluded.hora, actualizado_at = now(), actualizado_por = excluded.actualizado_por;
  end if;
end $$;
revoke all on function public.comida_persona_guardar(uuid, time) from public, anon;
grant execute on function public.comida_persona_guardar(uuid, time) to authenticated;

-- Para Argos (Shift / ficha): con hora OBLIGATORIA, ¿salió a comer fuera del
-- margen ese día? Devuelve los minutos de diferencia con la hora (0 si cumplió o
-- si la hora no es obligatoria; null si no hay hora o no salió a comer).
create or replace function public.comida_fuera_de_hora(_uid uuid, _dia date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with c as (select * from public.comida_de(_uid)),
       salida as (
         select min(b.started_at) as t
           from public.cowork_breaks b
          where b.user_id = _uid and b.kind in ('almuerzo', 'break')
            and (b.started_at at time zone 'America/Bogota')::date = _dia)
  select case
           when c.hora is null or s.t is null then null
           when not c.obligatoria then 0
           else greatest(0, abs(extract(epoch from ((s.t at time zone 'America/Bogota')::time - c.hora)) / 60)::int - c.margen_min)
         end
    from c, salida s;
$$;
-- Solo para otras funciones de la base (las de Argos la llaman por dentro): no
-- se expone a la app, para que nadie vea la comida de otro sin pasar por Argos.
revoke all on function public.comida_fuera_de_hora(uuid, date) from public, anon, authenticated;
