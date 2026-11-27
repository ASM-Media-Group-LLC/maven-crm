-- GRACIA DE CÁMARA Y PANTALLA POR EMPRESA Y POR POSICIÓN (Alvaro, 27/11/2026).
--   · «Cualquiera tiene 10 minutos para no compartir cámara y pantalla… después de
--     ahí se descuenta.» 10 minutos EN TOTAL (sin cámara + sin pantalla juntos),
--     POR TURNO. Antes eran 15 sin pantalla y 15 sin cámara, cada uno aparte.
--   · Cada empresa pone su número por defecto (10 si no pone nada) y una Posición
--     puede tener otro. Nadie lo pone persona por persona; RR. HH. sigue pudiendo
--     devolver minutos en un turno (argos_gracia_extra), que se suman al bolsillo.
--   · Una sola regla para las horas de la tabla del turno y para el pago.
-- La forma de lo que devuelven las funciones NO cambia: gracia_pantalla_min trae
-- ahora el bolsillo completo y gracia_camara_min 0 (lo mismo con extra_*).

-- 1) El número de cada empresa.
create table if not exists public.argos_gracia_empresa (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  minutos integer not null default 10 check (minutos between 0 and 240),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.argos_gracia_empresa enable row level security;
create policy argos_gracia_empresa_ver on public.argos_gracia_empresa for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy argos_gracia_empresa_poner on public.argos_gracia_empresa for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.es_admin_o_dueno((select auth.uid())));
create policy argos_gracia_empresa_cambiar on public.argos_gracia_empresa for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.es_admin_o_dueno((select auth.uid())))
  with check (tenant_id = public.current_tenant_id() and public.es_admin_o_dueno((select auth.uid())));
grant select, insert, update on public.argos_gracia_empresa to authenticated;

-- 2) El número de una Posición (null = el de la empresa).
alter table public.posiciones_borrador add column if not exists gracia_min integer
  check (gracia_min is null or gracia_min between 0 and 240);

-- 3) Cuántos minutos de gracia tiene una persona por turno.
create or replace function public.argos_gracia_minutos(_uid uuid)
returns integer
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select pb.gracia_min
       from public.posiciones_borrador_personas bp
       join public.posiciones_borrador pb on pb.id = bp.posicion_id and pb.activa
      where bp.user_id = _uid and pb.gracia_min is not null
      order by pb.gracia_min desc
      limit 1),
    (select e.minutos
       from public.tenant_members m
       join public.argos_gracia_empresa e on e.tenant_id = m.tenant_id
      where m.user_id = _uid
      limit 1),
    10);
$$;
revoke all on function public.argos_gracia_minutos(uuid) from public;
grant execute on function public.argos_gracia_minutos(uuid) to authenticated, service_role;

-- 4) Para la tabla del turno: la gracia de varias personas a la vez (solo las que
--    quien pregunta puede vigilar).
create or replace function public.argos_gracia_minutos_de(_ids uuid[])
returns table(user_id uuid, minutos integer)
language sql stable security definer set search_path to 'public'
as $$
  select x.id, public.argos_gracia_minutos(x.id)
    from unnest(_ids) as x(id)
   where x.id = (select auth.uid()) or public.puede_vigilar_a((select auth.uid()), x.id);
$$;
revoke all on function public.argos_gracia_minutos_de(uuid[]) from public;
grant execute on function public.argos_gracia_minutos_de(uuid[]) to authenticated;

-- 5) La cuenta del pago: cámara y pantalla juntas contra un solo bolsillo.
--    Se reescribe sobre la definición vigente de argos_gracia_calculo, cambiando
--    solo el reparto de la gracia; si algún trozo no coincide, la migración se
--    detiene sin tocar nada (no se aplica a medias).
do $mig$
declare
  d text := pg_get_functiondef('public.argos_gracia_calculo'::regproc);
  antes text;
  procedure_pasos text[][] := array[
    array['  v_usado_c numeric;' || chr(10),
          '  v_usado_c numeric;' || chr(10) || '  v_bolsa integer;' || chr(10) || '  v_usado numeric;' || chr(10)],
    array['  v_usado_p := least(v_pant, (v_cfg.pantalla_min + v_xp) * 60);' || chr(10) ||
          '  v_usado_c := least(v_cam, (v_cfg.camara_min + v_xc) * 60);',
          '  -- Un solo bolsillo (27/11/2026): la gracia de la persona + lo que devolvió RR. HH.' || chr(10) ||
          '  v_bolsa := public.argos_gracia_minutos(_uid) + v_xp + v_xc;' || chr(10) ||
          '  v_usado := least(v_pant + v_cam, v_bolsa * 60);' || chr(10) ||
          '  v_usado_p := least(v_pant, v_usado);' || chr(10) ||
          '  v_usado_c := v_usado - v_usado_p;'],
    array['  gracia_pantalla_min := v_cfg.pantalla_min + v_xp;' || chr(10) ||
          '  gracia_camara_min := v_cfg.camara_min + v_xc;' || chr(10) ||
          '  extra_pantalla_min := v_xp;' || chr(10) ||
          '  extra_camara_min := v_xc;',
          '  gracia_pantalla_min := v_bolsa;' || chr(10) ||
          '  gracia_camara_min := 0;' || chr(10) ||
          '  extra_pantalla_min := v_xp + v_xc;' || chr(10) ||
          '  extra_camara_min := 0;']
  ];
  i int;
begin
  for i in 1 .. array_length(procedure_pasos, 1) loop
    antes := d;
    d := replace(d, procedure_pasos[i][1], procedure_pasos[i][2]);
    if d = antes then
      raise exception 'argos_gracia_calculo cambió: el paso % no coincide, no se aplica nada', i;
    end if;
  end loop;
  execute d;
end
$mig$;

-- 6) Leer y guardar desde Ajustes. El de la empresa lo cambian el dueño y los
--    admins; el de un puesto, quien ya puede cambiarle la cámara y la pantalla.
create or replace function public.gracia_de_mi_empresa()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'minutos', coalesce((select e.minutos from public.argos_gracia_empresa e where e.tenant_id = public.current_tenant_id()), 10),
    'puede_cambiar', public.es_admin_o_dueno((select auth.uid())),
    'puestos', coalesce((
      select jsonb_object_agg(pb.id, pb.gracia_min)
        from public.posiciones_borrador pb
       where pb.tenant_id = public.current_tenant_id() and pb.gracia_min is not null
    ), '{}'::jsonb));
$$;
grant execute on function public.gracia_de_mi_empresa() to authenticated;

create or replace function public.gracia_empresa_guardar(_minutos integer)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'Solo el dueño o un admin cambia la gracia de la empresa' using errcode = '42501';
  end if;
  if _minutos is null or _minutos < 0 or _minutos > 240 then
    raise exception 'Minutos fuera de rango (0 a 240)' using errcode = '22023';
  end if;
  insert into public.argos_gracia_empresa (tenant_id, minutos, updated_at, updated_by)
  values (public.current_tenant_id(), _minutos, now(), (select auth.uid()))
  on conflict (tenant_id) do update set minutos = excluded.minutos, updated_at = now(), updated_by = excluded.updated_by;
end $$;
revoke all on function public.gracia_empresa_guardar(integer) from public;
grant execute on function public.gracia_empresa_guardar(integer) to authenticated;

create or replace function public.posicion_gracia_guardar(_posicion uuid, _minutos integer)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.puede_cambiar_exigencias((select auth.uid()), _posicion) then
    raise exception 'No puedes cambiar la gracia de este puesto' using errcode = '42501';
  end if;
  if _minutos is not null and (_minutos < 0 or _minutos > 240) then
    raise exception 'Minutos fuera de rango (0 a 240)' using errcode = '22023';
  end if;
  perform set_config('maven.posiciones_aplicando', 'on', true);
  update public.posiciones_borrador set gracia_min = _minutos, updated_at = now() where id = _posicion;
  perform set_config('maven.posiciones_aplicando', '', true);
end $$;
revoke all on function public.posicion_gracia_guardar(uuid, integer) from public;
grant execute on function public.posicion_gracia_guardar(uuid, integer) to authenticated;
