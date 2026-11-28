-- ÁREAS DE LA EMPRESA (Alvaro, 28/11/2026, preguntas y respuestas):
--   «sería bueno un filtro ahí [Argos → Shift] para verlo por posiciones, las que
--   haya creado la plataforma, o por situaciones» → también por departamento.
--   «pilas que el área de ajustes y posiciones sea escalable para otras empresas».
--   · Cada empresa crea SUS áreas (nombre libre: «Chat», «Ventas»…). Nada se
--     siembra ni se escribe a mano para una empresa: la lista empieza vacía.
--   · Cada posición (posiciones_borrador) puede pertenecer a un área. Borrar un
--     área deja sus posiciones sin área (no borra nada más).
--   · Cambian: dueño, quien configura la empresa y RR. HH. (igual que los turnos).
--     Un área es solo una etiqueta para agrupar: no da ni quita permisos.
--   · posiciones_de_la_gente(): las posiciones (y su área) de cada persona, para el
--     filtro de Shift. Quien tiene dos posiciones sale en las dos.

-- ─── 1. La lista de áreas de cada empresa ────────────────────────────────────
create table if not exists public.areas_empresa (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 40),
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, nombre)
);
alter table public.areas_empresa enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'areas_empresa' and policyname = 'areas_empresa_ver') then
    create policy areas_empresa_ver on public.areas_empresa
      for select to authenticated
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;
-- Nadie escribe con su sesión: solo area_empresa_guardar / area_empresa_borrar (definer).
revoke insert, update, delete on public.areas_empresa from anon, authenticated;
grant select on public.areas_empresa to authenticated;

-- ─── 2. El área de cada posición ─────────────────────────────────────────────
alter table public.posiciones_borrador
  add column if not exists area_id uuid references public.areas_empresa(id) on delete set null;
create index if not exists posiciones_borrador_area_idx on public.posiciones_borrador (area_id);

-- ─── 3. Leer: las áreas y las posiciones de la empresa ───────────────────────
create or replace function public.areas_de_mi_empresa()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'puede_editar', public.puedo_editar_turnos_empresa(),
    'areas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'nombre', a.nombre,
        'puestos', (select count(*) from public.posiciones_borrador pb where pb.area_id = a.id and pb.activa))
      order by a.orden, a.nombre)
      from public.areas_empresa a where a.tenant_id = public.empresa_de((select auth.uid()))), '[]'::jsonb),
    'puestos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pb.id, 'nombre', pb.nombre, 'area_id', pb.area_id,
        'personas', (select count(*) from public.posiciones_borrador_personas bp where bp.posicion_id = pb.id))
      order by pb.orden, pb.nombre)
      from public.posiciones_borrador pb
     where pb.activa and pb.tenant_id = public.empresa_de((select auth.uid()))), '[]'::jsonb));
$function$;
revoke all on function public.areas_de_mi_empresa() from public, anon;
grant execute on function public.areas_de_mi_empresa() to authenticated;

-- ─── 4. Guardar y borrar un área ─────────────────────────────────────────────
create or replace function public.area_empresa_guardar(_id uuid, _nombre text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  emp uuid := public.empresa_de((select auth.uid()));
  v_id uuid;
begin
  if not public.puedo_editar_turnos_empresa() then
    raise exception 'sin permiso para cambiar las áreas de la empresa' using errcode = '42501';
  end if;
  if emp is null then raise exception 'sin empresa' using errcode = '42501'; end if;
  if length(btrim(coalesce(_nombre, ''))) = 0 then
    raise exception 'el área necesita un nombre' using errcode = '22023';
  end if;
  if _id is null then
    insert into public.areas_empresa (tenant_id, nombre, orden)
    values (emp, btrim(_nombre), coalesce((select max(orden) + 1 from public.areas_empresa where tenant_id = emp), 1))
    returning id into v_id;
  else
    update public.areas_empresa set nombre = btrim(_nombre), updated_at = now()
     where id = _id and tenant_id = emp
    returning id into v_id;
    if v_id is null then raise exception 'no encontrado' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end
$function$;
revoke all on function public.area_empresa_guardar(uuid, text) from public, anon;
grant execute on function public.area_empresa_guardar(uuid, text) to authenticated;

create or replace function public.area_empresa_borrar(_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  emp uuid := public.empresa_de((select auth.uid()));
  n int;
begin
  if not public.puedo_editar_turnos_empresa() then
    raise exception 'sin permiso para cambiar las áreas de la empresa' using errcode = '42501';
  end if;
  -- Las posiciones del área quedan sin área (la FK lo hace); se marca el cambio
  -- como de la app para el trigger de posiciones.
  perform set_config('maven.posiciones_aplicando', 'on', true);
  delete from public.areas_empresa where id = _id and tenant_id = emp;
  get diagnostics n = row_count;
  perform set_config('maven.posiciones_aplicando', '', true);
  if n = 0 then raise exception 'no encontrado' using errcode = 'P0002'; end if;
end
$function$;
revoke all on function public.area_empresa_borrar(uuid) from public, anon;
grant execute on function public.area_empresa_borrar(uuid) to authenticated;

-- ─── 5. El área de una posición ──────────────────────────────────────────────
create or replace function public.posicion_area_guardar(_posicion uuid, _area uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  emp uuid := public.empresa_de((select auth.uid()));
begin
  if not public.puedo_editar_turnos_empresa() then
    raise exception 'sin permiso para cambiar las áreas de la empresa' using errcode = '42501';
  end if;
  if not exists (select 1 from public.posiciones_borrador where id = _posicion and tenant_id = emp) then
    raise exception 'esa posición no es de esta empresa' using errcode = '22023';
  end if;
  if _area is not null and not exists (select 1 from public.areas_empresa where id = _area and tenant_id = emp) then
    raise exception 'esa área no es de esta empresa' using errcode = '22023';
  end if;
  perform set_config('maven.posiciones_aplicando', 'on', true);
  update public.posiciones_borrador set area_id = _area, updated_at = now() where id = _posicion;
  perform set_config('maven.posiciones_aplicando', '', true);
end $function$;
revoke all on function public.posicion_area_guardar(uuid, uuid) from public, anon;
grant execute on function public.posicion_area_guardar(uuid, uuid) to authenticated;

-- ─── 6. Las posiciones (y el área) de cada persona, para el filtro de Shift ──
create or replace function public.posiciones_de_la_gente(_ids uuid[])
returns table (user_id uuid, posicion_id uuid, posicion text, area_id uuid, area text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select bp.user_id, pb.id, pb.nombre, a.id, a.nombre
    from unnest(_ids) as u(id)
    join public.posiciones_borrador_personas bp on bp.user_id = u.id
    join public.posiciones_borrador pb on pb.id = bp.posicion_id and pb.activa
    left join public.areas_empresa a on a.id = pb.area_id
   where public.puede_vigilar(u.id) or public.puede_editar_horario(u.id) or u.id = (select auth.uid());
$function$;
revoke all on function public.posiciones_de_la_gente(uuid[]) from public, anon;
grant execute on function public.posiciones_de_la_gente(uuid[]) to authenticated;
