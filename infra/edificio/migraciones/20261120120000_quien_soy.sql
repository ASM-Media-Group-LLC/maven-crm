-- LA PUERTA PRENDIDA · ¿QUIÉN SOY EN LA PLATAFORMA? (19/11/2026)
-- ⚠️ SOLO PARA EL EDIFICIO maven-agencias (ezeigddgkaemxpshghmu). NUNCA en Kash
-- (lsagslbkliprespbyhts). Va DESPUÉS de arbol, arbol_funciones y cobros.
-- Banco: infra/edificio/tests/arbol.ts (sección «Quién soy»).
--
-- Qué trae (lo que necesita el panel real del dueño en app.maven-ai.me/plataforma):
--   1. quien_soy_en_la_plataforma(): dueño / admin de plataforma / admin de un cliente
--      (con su organización) o nada. El panel decide con esto a qué pantalla va cada uno.
--   2. equipo_de_maven(): la lista «Equipo de Maven» (plataforma_admins) para leerla
--      sin edge. Solo la plataforma. Agregar y quitar sigue por la edge (otro paso).
--   3. Vuelve a correr el alta del dueño (rusin24@gmail.com) por si su cuenta se creó
--      después del árbol (no hace nada si no existe; no cambia a nadie más).
--
-- Vuelta atrás:
--| drop function if exists public.equipo_de_maven();
--| drop function if exists public.quien_soy_en_la_plataforma();

-- Candado: esto no es Kash.
do $$
begin
  if exists (select 1 from public.tenants where id = '30869615-f579-4981-8a1f-dbebc61eae2d') then
    raise exception 'quien_soy: esta base tiene el tenant de Kash; esta migración es SOLO para el edificio maven-agencias';
  end if;
end $$;

create or replace function public.quien_soy_en_la_plataforma()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _uid uuid := (select auth.uid());
  _nivel text;
  _org uuid;
  _nombre text;
  _correo text;
begin
  if _uid is null then
    return jsonb_build_object('tipo', null);
  end if;
  select u.email, coalesce(nullif(p.full_name, ''), u.email)
    into _correo, _nombre
    from auth.users u left join public.profiles p on p.id = u.id
   where u.id = _uid;
  select nivel into _nivel from public.plataforma_admins where user_id = _uid;
  if _nivel is null then
    select a.organizacion_id into _org
      from public.organizacion_admins a
     where a.user_id = _uid
     order by a.principal desc, a.created_at
     limit 1;
  end if;
  return jsonb_build_object(
    'user_id', _uid,
    'nombre', coalesce(_nombre, ''),
    'correo', coalesce(_correo, ''),
    'tipo', case
              when _nivel = 'dueno' then 'dueno'
              when _nivel is not null then 'admin_plataforma'
              when _org is not null then 'admin_cliente'
              else null
            end,
    'organizacion_id', _org);
end;
$$;
comment on function public.quien_soy_en_la_plataforma() is
  'Quien llama en la plataforma: dueno | admin_plataforma | admin_cliente (con organizacion_id) | null. Solo responde por quien llama.';
revoke all on function public.quien_soy_en_la_plataforma() from public, anon;
grant execute on function public.quien_soy_en_la_plataforma() to authenticated, service_role;

create or replace function public.equipo_de_maven()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_admin_de_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: solo la plataforma';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'user_id', pa.user_id,
             'nombre', coalesce(nullif(p.full_name, ''), u.email),
             'correo', u.email,
             'nivel', pa.nivel,
             'estado', case when u.last_sign_in_at is null then 'invitada' else 'activa' end,
             'ultimo_ingreso', u.last_sign_in_at
           ) order by pa.nivel = 'dueno' desc, pa.created_at), '[]'::jsonb)
      from public.plataforma_admins pa
      join auth.users u on u.id = pa.user_id
      left join public.profiles p on p.id = pa.user_id);
end;
$$;
comment on function public.equipo_de_maven() is
  'El equipo de Maven (plataforma_admins) para el panel. Solo la plataforma.';
revoke all on function public.equipo_de_maven() from public, anon;
grant execute on function public.equipo_de_maven() to authenticated, service_role;

-- El dueño de la plataforma (otra vez: su cuenta pudo crearse después del árbol).
insert into public.plataforma_admins (user_id, nivel)
select id, 'dueno' from auth.users where lower(email) = 'rusin24@gmail.com'
on conflict (user_id) do update set nivel = 'dueno';
