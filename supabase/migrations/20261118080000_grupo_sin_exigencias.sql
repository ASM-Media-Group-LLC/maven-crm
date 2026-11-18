-- EL GRUPO DE LUIS NO TIENE NADA OBLIGATORIO (Alvaro, 18/11/2026, segunda vuelta).
--
-- «Álvaro [René] también lo vamos a poner como Grace, como Luis y Jacqueline…
-- no los obliga ni a cámara ni a pantalla». Decidido con preguntas y respuestas:
--   · El grupo: Luis Carlos Ortega, Juan Pachas, Grace Gelves, Jackeline Mejía y
--     Alvaro René. Alvaro (el dueño) sigue libre.
--   · Ni cámara ni pantalla se prenden solas ni se exigen; su tiempo cuenta
--     mientras estén conectados.
--   · Si prenden la cámara, Argos les toma fotos y los juzga como a todos.
--   · Las pantallas de los supervisores en el Hub las ven los admins por ROL
--     (René sigue viéndolas aunque ahora Argos lo vigile).

alter table public.argos_reglas_persona
  add column if not exists camara_obligatoria boolean not null default true;

insert into public.argos_reglas_persona (user_id, pantalla_obligatoria, camara_obligatoria, vigilar_aunque_admin, nota)
select u.id, false, false, v.vigilar, v.nota
from (values
  ('41b35cef-82a8-4991-9234-3514b0064767'::uuid, false, 'Luis Carlos Ortega: sin cámara ni pantalla obligatorias (Alvaro, 18/11/2026)'),
  ('75bca8d9-ded5-4e86-b591-88209f6a5e6c'::uuid, false, 'Juan Pachas: como Luis (Alvaro, 18/11/2026)'),
  ('8b90f141-8546-4cfd-a358-56ff227623df'::uuid, true,  'Grace Gelves: admin, como Luis (Alvaro, 18/11/2026)'),
  ('69d693c9-8620-4549-9c2f-3436b484bde1'::uuid, true,  'Jackeline Mejía: admin, como Luis (Alvaro, 18/11/2026)'),
  ('fcdfdfcb-c0ab-4c82-b6d9-d50d37ab086e'::uuid, true,  'Alvaro René: admin, como Luis (Alvaro, 18/11/2026)')
) as v(id, vigilar, nota)
join auth.users u on u.id = v.id
on conflict (user_id) do update
  set pantalla_obligatoria = excluded.pantalla_obligatoria,
      camara_obligatoria = excluded.camara_obligatoria,
      vigilar_aunque_admin = excluded.vigilar_aunque_admin,
      nota = excluded.nota,
      actualizado = now();

-- Cambia lo que devuelve: se borra y se vuelve a crear (no hay otra forma).
drop function if exists public.mi_regla_de_anfitrion();
create function public.mi_regla_de_anfitrion()
returns table (vigilado boolean, pantalla_obligatoria boolean, camara_obligatoria boolean)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select v.vigilado,
         v.vigilado and coalesce(r.pantalla_obligatoria, true),
         v.vigilado and coalesce(r.camara_obligatoria, true)
  from (select public.argos_vigila_a((select auth.uid())) as vigilado) v
  left join public.argos_reglas_persona r on r.user_id = (select auth.uid());
$function$;
revoke all on function public.mi_regla_de_anfitrion() from public, anon;
grant execute on function public.mi_regla_de_anfitrion() to authenticated;

-- Los que ven en el Hub la pantalla de un vigilado: los admins por rol.
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
  where public.is_in_role_group(ur.user_id, 'admin');
$function$;
