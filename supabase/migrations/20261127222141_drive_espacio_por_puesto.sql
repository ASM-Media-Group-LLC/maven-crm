-- ESPACIO DEL DRIVE POR PUESTO Y POR PERSONA, CON «SIN TOPE» (Alvaro, 27/11/2026,
-- preguntas y respuestas). Grace: la editora de contenido se quedó sin espacio
-- (100 GB). Alvaro: «no hay que ponerle límite… en el lado de roles… ilimitado».
--   · Cada puesto (posiciones_borrador) puede traer su espacio: N GB o «sin tope».
--   · A una persona se le puede poner otro (drive_cupos, como hoy) o «sin tope».
--   · El espacio de alguien: el suyo → el de sus puestos (si alguno es sin tope,
--     sin tope; si no, el más grande) → el de siempre (drive_cupo_por_defecto, 50 GB).
--   · «Sin tope» = cupo null en drive_uso / drive_usos_de_mi_agencia. La edge drive
--     y oficina-doc ya saltan el chequeo con null (se despliegan ANTES que esto).
--   · El límite de verdad sigue siendo el disco del NAS (la edge lo mira en cada subida).
--   · Lo cambian: el puesto, quien configura la empresa o un admin del Drive; la
--     persona, un admin del Drive (la misma RLS de drive_cupos de hoy).
-- Las funciones drive_uso y drive_usos_de_mi_agencia se copiaron de producción
-- (27/11/2026); solo cambia de dónde sale el cupo.

-- ─── 1. Las columnas ─────────────────────────────────────────────────────────
alter table public.drive_cupos add column if not exists sin_tope boolean not null default false;
alter table public.posiciones_borrador
  add column if not exists drive_cupo_gb integer check (drive_cupo_gb is null or drive_cupo_gb between 0 and 100000),
  add column if not exists drive_sin_tope boolean not null default false;

-- ─── 2. El espacio de alguien (null = sin tope) ──────────────────────────────
create or replace function public.drive_cupo_de(_uid uuid)
returns bigint
language sql
stable security definer
set search_path to 'public'
as $function$
  with propio as (select c.bytes_max, c.sin_tope from public.drive_cupos c where c.user_id = _uid),
  puestos as (
    select bool_or(pb.drive_sin_tope) as sin_tope, max(pb.drive_cupo_gb) as gb
      from public.posiciones_borrador_personas bp
      join public.posiciones_borrador pb on pb.id = bp.posicion_id and pb.activa
     where bp.user_id = _uid
  )
  select case
    when exists (select 1 from propio) then
      (select case when sin_tope then null else bytes_max end from propio)
    when coalesce((select sin_tope from puestos), false) then null
    when (select gb from puestos) is not null then (select gb from puestos)::bigint * 1024 * 1024 * 1024
    else public.drive_cupo_por_defecto()
  end;
$function$;
revoke all on function public.drive_cupo_de(uuid) from public, anon, authenticated;

-- De dónde sale (para la pantalla de cupos): 'persona', 'puesto' o 'empresa'.
create or replace function public.drive_cupo_origen(_uid uuid)
returns text
language sql
stable security definer
set search_path to 'public'
as $function$
  select case
    when exists (select 1 from public.drive_cupos c where c.user_id = _uid) then 'persona'
    when exists (select 1 from public.posiciones_borrador_personas bp
                   join public.posiciones_borrador pb on pb.id = bp.posicion_id and pb.activa
                  where bp.user_id = _uid and (pb.drive_sin_tope or pb.drive_cupo_gb is not null)) then 'puesto'
    else 'empresa'
  end;
$function$;
revoke all on function public.drive_cupo_origen(uuid) from public, anon, authenticated;

-- ─── 3. Las mismas funciones de siempre, con el cupo nuevo ───────────────────
create or replace function public.drive_uso(p_user uuid default null::uuid)
 returns table(usado bigint, cupo bigint)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  quien uuid := coalesce(p_user, auth.uid());
begin
  if quien <> auth.uid() and not (
    public.drive_soy_admin()
    and exists (select 1 from public.tenant_members m where m.user_id = quien and m.tenant_id = public.current_tenant_id())
  ) then
    raise exception 'No puedes ver el uso de otra persona' using errcode = '42501';
  end if;
  return query
  select
    coalesce((select sum(i.size) from public.drive_items i where i.owner_id = quien and i.tipo = 'archivo' and i.unidad_id is null), 0)::bigint,
    public.drive_cupo_de(quien);
end;
$function$;

create or replace function public.drive_usos_de_mi_agencia()
 returns table(user_id uuid, nombre text, usado bigint, cupo bigint, cupo_propio boolean)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not public.drive_soy_admin() then
    raise exception 'Solo para admins' using errcode = '42501';
  end if;
  return query
  select m.user_id,
         coalesce(nullif(btrim(p.full_name), ''), u.email::text, ''),
         coalesce((select sum(i.size) from public.drive_items i where i.owner_id = m.user_id and i.tipo = 'archivo' and i.unidad_id is null), 0)::bigint,
         public.drive_cupo_de(m.user_id),
         c.user_id is not null
  from public.tenant_members m
  left join public.profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  left join public.drive_cupos c on c.user_id = m.user_id
  where m.tenant_id = public.current_tenant_id()
  order by 3 desc, 2;
end;
$function$;

-- ─── 4. El espacio de cada puesto: leer y guardar ────────────────────────────
create or replace function public.puedo_cambiar_espacio_drive()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select public.drive_soy_admin() or public.puedo_configurar_empresa();
$function$;
revoke all on function public.puedo_cambiar_espacio_drive() from public, anon;
grant execute on function public.puedo_cambiar_espacio_drive() to authenticated;

create or replace function public.drive_espacio_por_puesto()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'puede', public.puedo_cambiar_espacio_drive(),
    'por_defecto_gb', public.drive_cupo_por_defecto() / (1024 * 1024 * 1024),
    'puestos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pb.id, 'nombre', pb.nombre, 'gb', pb.drive_cupo_gb, 'sin_tope', pb.drive_sin_tope,
        'personas', (select count(*) from public.posiciones_borrador_personas bp where bp.posicion_id = pb.id))
      order by pb.orden, pb.nombre)
      from public.posiciones_borrador pb
     where pb.activa and pb.tenant_id = public.current_tenant_id()), '[]'::jsonb));
$function$;
revoke all on function public.drive_espacio_por_puesto() from public, anon;
grant execute on function public.drive_espacio_por_puesto() to authenticated;

create or replace function public.posicion_drive_guardar(_posicion uuid, _gb integer, _sin_tope boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.puedo_cambiar_espacio_drive() then
    raise exception 'No puedes cambiar el espacio del Drive' using errcode = '42501';
  end if;
  if not exists (select 1 from public.posiciones_borrador where id = _posicion and tenant_id = public.current_tenant_id()) then
    raise exception 'Ese puesto no es de tu empresa' using errcode = '42501';
  end if;
  if _gb is not null and (_gb < 0 or _gb > 100000) then
    raise exception 'GB fuera de rango' using errcode = '22023';
  end if;
  perform set_config('maven.posiciones_aplicando', 'on', true);
  update public.posiciones_borrador
     set drive_cupo_gb = case when coalesce(_sin_tope, false) then null else _gb end,
         drive_sin_tope = coalesce(_sin_tope, false),
         updated_at = now()
   where id = _posicion;
  perform set_config('maven.posiciones_aplicando', '', true);
end $function$;
revoke all on function public.posicion_drive_guardar(uuid, integer, boolean) from public, anon;
grant execute on function public.posicion_drive_guardar(uuid, integer, boolean) to authenticated;
