-- Argos: el tablero de supervisores (hub_estado_supervisores) se caía con mucha
-- gente (simulacro de 1000 personas, 19/11: 0 % de éxito, hasta 27 s). Cada
-- vez que un supervisor/admin lo abría (cada 20 s cada uno) se recalculaba a
-- TODOS uno por uno (turno, permisos, Cowork…): con 1000 personas son ~3-4 s
-- de base de datos por llamada, y con varios a la vez pasaba el tiempo máximo.
--
-- Arreglo: el cálculo lo hace la base sola cada 15 s (pg_cron) y lo guarda en
-- hub_estado_cache; el tablero solo lee esa foto (milisegundos). Solo se
-- calcula para las agencias que alguien está mirando (últimos 2 min).
-- Si el reloj se detuviera, el tablero calcula él mismo (como antes).
-- Lo que se ve no cambia: mismas reglas, mismo orden.
set check_function_bodies = off;

create table if not exists public.hub_estado_cache (
  tenant_id uuid primary key,
  calculado timestamptz not null,
  leido timestamptz not null default now(),
  filas jsonb not null
);
alter table public.hub_estado_cache add column if not exists leido timestamptz not null default now();
alter table public.hub_estado_cache enable row level security;
revoke all on public.hub_estado_cache from anon, authenticated;

-- El cálculo de siempre (el mismo de hub_estado_supervisores), para una agencia.
create or replace function public.hub_estado_calcular(_tenant uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with prob as (
    select * from public.hub_problemas_ahora(now()) h where h.tenant_id = _tenant
  ),
  gente as (
    select p.id, p.full_name
      from public.profiles p
      join public.tenant_members m on m.user_id = p.id and m.tenant_id = _tenant
      left join public.hub_senal s on s.user_id = p.id
     where p.deleted_at is null
       and public.argos_vigila_a(p.id)
       and (p.nivel in ('supervisor', 'manager') or s.actualizado > now() - interval '12 hours')
       and exists (select 1 from public.turno_en_curso(p.id, now()))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', g.id, 'nombre', g.full_name,
           'problema', coalesce(pr.problema, 'ok'), 'causa', pr.causa, 'desde', pr.desde,
           'texto', case when pr.causa is null then null else public.hub_texto_causa(pr.causa) end)
         order by g.full_name), '[]'::jsonb)
    from gente g
    left join lateral (
      select * from prob where prob.user_id = g.id
       order by case prob.problema when 'fuera' then 0 when 'pantalla' then 1 else 2 end
       limit 1
    ) pr on true;
$function$;
revoke all on function public.hub_estado_calcular(uuid) from public, anon, authenticated;

-- Lo corre pg_cron cada 15 s: refresca las agencias que alguien mira.
create or replace function public.hub_estado_refrescar()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
begin
  if not pg_try_advisory_xact_lock(hashtext('hub_estado_refrescar')) then
    return;
  end if;
  -- Las agencias que alguien mira, y las que aún no tienen foto (así la
  -- primera vez del tablero ya la encuentra hecha).
  for r in select t.id as tenant_id
             from public.tenants t
             left join public.hub_estado_cache c on c.tenant_id = t.id
            where c.tenant_id is null or c.leido > now() - interval '2 minutes' loop
    insert into public.hub_estado_cache as c (tenant_id, calculado, leido, filas)
    values (r.tenant_id, now(), now() - interval '1 hour', public.hub_estado_calcular(r.tenant_id))
    on conflict (tenant_id) do update set filas = excluded.filas, calculado = excluded.calculado;
  end loop;
end;
$function$;
revoke all on function public.hub_estado_refrescar() from public, anon, authenticated;

create or replace function public.hub_estado_supervisores()
 returns table(user_id uuid, nombre text, problema text, causa text, desde timestamptz, texto text)
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_tenant uuid := public.current_tenant_id();
  v_cal timestamptz;
  v_leido timestamptz;
  v_filas jsonb;
begin
  if not coalesce(public.ve_argos(), false) then
    raise exception 'hub_estado_supervisores: sin permiso' using errcode = '42501';
  end if;

  select c.calculado, c.leido, c.filas into v_cal, v_leido, v_filas
    from public.hub_estado_cache c where c.tenant_id = v_tenant;

  if v_filas is null
     or (v_cal < now() - interval '60 seconds'
         and pg_try_advisory_xact_lock(hashtext('hub_estado_supervisores:' || coalesce(v_tenant::text, ''))))
  then
    -- Primera vez o nadie lo miraba hace rato: se calcula aquí (como antes).
    -- Si otro ya lo está calculando, se muestra la foto que hay (sin hacer fila).
    v_filas := public.hub_estado_calcular(v_tenant);
    if v_tenant is not null then
      insert into public.hub_estado_cache as c (tenant_id, calculado, leido, filas)
      values (v_tenant, now(), now(), v_filas)
      on conflict (tenant_id) do update
        set calculado = excluded.calculado, leido = excluded.leido, filas = excluded.filas;
    end if;
  elsif v_leido < now() - interval '30 seconds' then
    update public.hub_estado_cache set leido = now() where tenant_id = v_tenant;
  end if;

  return query
  select (e.f->>'user_id')::uuid, e.f->>'nombre', e.f->>'problema', e.f->>'causa',
         (e.f->>'desde')::timestamptz, e.f->>'texto'
    from jsonb_array_elements(v_filas) with ordinality as e(f, n)
   order by e.n;
end;
$function$;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'hub-estado-supervisores';
    perform cron.schedule('hub-estado-supervisores', '15 seconds', 'select public.hub_estado_refrescar()');
  end if;
end
$cron$;
