-- REGLAS DE PANTALLA Y DE ARGOS POR PERSONA EN COWORK (Alvaro, 18/11/2026).
--
-- Hasta hoy: Argos vigila a todos menos a los admins, y a todo anfitrión que no
-- es admin se le comparte la pantalla sola en el Supervisor Hub. Alvaro decidió:
--
--   · Libres, como hoy: los admins (él y Alvaro René).
--   · «Como Luis»: Luis Carlos Ortega, Juan Pachas, Grace Gelves y Jackeline
--     Mejía. Argos los vigila (fotos, cámara, tiempo) pero la pantalla del Hub
--     NO es obligatoria: si la comparten y la quitan, ahí sí cuenta. Grace y
--     Jackeline son admins: pasan a estar vigiladas igual.
--   · El resto de anfitriones (supervisores): pantalla sola y obligatoria en el
--     Hub, y Argos los trata como a un chatter.
--
-- La tabla dice solo las EXCEPCIONES; lo que no está, sigue la regla de su rol.
-- Se edita por SQL (o desde un panel futuro); nadie del navegador la escribe.

create table if not exists public.argos_reglas_persona (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- false = la pantalla del Hub no se comparte sola ni se le exige.
  pantalla_obligatoria boolean not null default true,
  -- true = Argos lo vigila aunque sea admin.
  vigilar_aunque_admin boolean not null default false,
  nota text,
  actualizado timestamptz not null default now()
);
alter table public.argos_reglas_persona enable row level security;

-- Cada uno lee SU regla (el tablero de Cowork la necesita). Nadie escribe.
drop policy if exists argos_reglas_persona_propia on public.argos_reglas_persona;
create policy argos_reglas_persona_propia on public.argos_reglas_persona
  for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.argos_reglas_persona (user_id, pantalla_obligatoria, vigilar_aunque_admin, nota)
select u.id, false, v.vigilar, v.nota
from (values
  ('41b35cef-82a8-4991-9234-3514b0064767'::uuid, false, 'Luis Carlos Ortega: pantalla del Hub opcional (Alvaro, 18/11/2026)'),
  ('75bca8d9-ded5-4e86-b591-88209f6a5e6c'::uuid, false, 'Juan Pachas: como Luis (Alvaro, 18/11/2026)'),
  ('8b90f141-8546-4cfd-a358-56ff227623df'::uuid, true,  'Grace Gelves: admin, vigilada como Luis (Alvaro, 18/11/2026)'),
  ('69d693c9-8620-4549-9c2f-3436b484bde1'::uuid, true,  'Jackeline Mejía: admin, vigilada como Luis (Alvaro, 18/11/2026)')
) as v(id, vigilar, nota)
join auth.users u on u.id = v.id
on conflict (user_id) do update
  set pantalla_obligatoria = excluded.pantalla_obligatoria,
      vigilar_aunque_admin = excluded.vigilar_aunque_admin,
      nota = excluded.nota,
      actualizado = now();

-- ¿Argos vigila a esta persona? Todos menos los admins, salvo los admins
-- marcados con vigilar_aunque_admin. La usan el monitor de cámara (cliente y
-- edge monitor-vision) y el tablero de Cowork.
create or replace function public.argos_vigila_a(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select not coalesce(public.is_in_role_group(_uid, 'admin'), false)
      or exists (select 1 from public.argos_reglas_persona r where r.user_id = _uid and r.vigilar_aunque_admin);
$function$;

-- Mi regla en Cowork: si Argos me vigila y si la pantalla del Hub es obligatoria.
create or replace function public.mi_regla_de_anfitrion()
returns table (vigilado boolean, pantalla_obligatoria boolean)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.argos_vigila_a((select auth.uid())) as vigilado,
         public.argos_vigila_a((select auth.uid()))
           and coalesce((select r.pantalla_obligatoria from public.argos_reglas_persona r
                          where r.user_id = (select auth.uid())), true) as pantalla_obligatoria;
$function$;

-- Quiénes ven, en el Supervisor Hub, la pantalla de un anfitrión vigilado: los
-- que Argos NO vigila (los admins libres). Así los supervisores no se ven la
-- pantalla entre ellos, que era otro espejo infinito.
create or replace function public.cowork_ven_pantallas_del_hub()
returns uuid[]
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(array_agg(distinct ur.user_id), '{}')
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id and p.deleted_at is null
  where public.is_in_role_group(ur.user_id, 'admin')
    and not public.argos_vigila_a(ur.user_id);
$function$;

revoke all on function public.argos_vigila_a(uuid) from public, anon;
revoke all on function public.mi_regla_de_anfitrion() from public, anon;
revoke all on function public.cowork_ven_pantallas_del_hub() from public, anon;
grant execute on function public.argos_vigila_a(uuid) to authenticated, service_role;
grant execute on function public.mi_regla_de_anfitrion() to authenticated;
grant execute on function public.cowork_ven_pantallas_del_hub() to authenticated;
