-- Every reviewed edit is atomic and rejects stale snapshots from another tab.
create table public.posiciones_revisiones (
  id bigint generated always as identity primary key,
  posicion_id uuid not null,
  actor uuid not null references auth.users(id),
  antes jsonb not null,
  despues jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.posiciones_revisiones enable row level security;
revoke all on public.posiciones_revisiones from anon, authenticated;
grant select on public.posiciones_revisiones to authenticated;
create policy posiciones_revisiones_dueno on public.posiciones_revisiones
  for select to authenticated using ((select public.es_dueno((select auth.uid()))));

create or replace function public.posicion_aplicar_revision(_id uuid, _revision timestamptz, _cambios jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  anterior public.posiciones_borrador%rowtype;
  actual public.posiciones_borrador%rowtype;
  actor uuid := auth.uid();
begin
  if actor is null or not public.es_dueno(actor) then
    raise exception 'Solo el dueño puede aplicar permisos' using errcode='42501';
  end if;
  if jsonb_typeof(_cambios) is distinct from 'object'
     or not (_cambios ?& array['checks','alcances','acceso_total','todas_creadoras','modalidad_id'])
     or exists(select 1 from jsonb_object_keys(_cambios) k where k not in ('checks','alcances','acceso_total','todas_creadoras','modalidad_id'))
     or jsonb_typeof(_cambios->'checks') is distinct from 'object'
     or jsonb_typeof(_cambios->'alcances') is distinct from 'object'
     or jsonb_typeof(_cambios->'acceso_total') is distinct from 'boolean'
     or jsonb_typeof(_cambios->'todas_creadoras') is distinct from 'boolean' then
    raise exception 'Configuración de permisos inválida' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_each(_cambios->'checks') x where jsonb_typeof(x.value) <> 'boolean')
     or exists(select 1 from jsonb_each_text(_cambios->'alcances') x where x.value is null or x.value not in ('all','subordinates','self')) then
    raise exception 'Permisos o alcance de datos inválidos' using errcode='22023';
  end if;
  select * into anterior from public.posiciones_borrador where id=_id for update;
  if not found then raise exception 'La posición ya no existe' using errcode='P0002'; end if;
  if _revision is null or anterior.updated_at is distinct from _revision then
    raise exception 'La posición cambió en otra sesión. Recarga y revisa los cambios antes de aplicar.' using errcode='40001';
  end if;
  update public.posiciones_borrador set
    checks=_cambios->'checks', alcances=_cambios->'alcances',
    acceso_total=(_cambios->>'acceso_total')::boolean,
    todas_creadoras=(_cambios->>'todas_creadoras')::boolean,
    modalidad_id=(_cambios->>'modalidad_id')::uuid,
    updated_at=clock_timestamp()
  where id=_id returning * into actual;
  insert into public.posiciones_revisiones(posicion_id,actor,antes,despues)
  values (_id,actor,to_jsonb(anterior),to_jsonb(actual));
  return to_jsonb(actual);
end $$;
revoke all on function public.posicion_aplicar_revision(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.posicion_aplicar_revision(uuid,timestamptz,jsonb) to authenticated;
