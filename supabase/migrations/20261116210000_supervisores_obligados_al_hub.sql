-- SUPERVISORES OBLIGADOS AL SUPERVISOR HUB (Alvaro, 16/11/2026): «Tienen que estar
-- obligatoriamente ahí con todo prendido. Ahí es como nos protegemos».
--
-- 1) Luis, Daniel, Breyner y Vanessa dejan de ser «libres»: como a todos, Maven los
--    manda a Cowork si no están. Para un supervisor «estar» es tener el Supervisor
--    Hub conectado (su latido), así que cuentan el vigía de fuera de Cowork, los
--    minutos de gracia y la nota igual que para los chatters.
-- 2) Cuando Argos reporta a uno de ellos, el aviso también les llega a los otros
--    supervisores que son anfitriones en todos los Coworks (antes solo dueño, admins
--    y RR. HH.).

-- Respaldo de quiénes eran libres, por si hay que volver atrás.
create table if not exists public.cowork_libres_respaldo_20261116 as
  select * from public.cowork_libres;
alter table public.cowork_libres_respaldo_20261116 enable row level security;

delete from public.cowork_libres
 where user_id in (
   '41b35cef-82a8-4991-9234-3514b0064767',  -- Luis Carlos Ortega Roman
   '4d502376-eb16-42f6-bda2-4b92582a26e6',  -- Daniel Ospina
   '81da74ae-138b-4229-a7cd-8d079879e7c5',  -- Breyner Garzon
   '443bf3bd-7475-4a90-a405-71444a5be34c'   -- Vanessa Giraldo
 );

create or replace function public.destinatarios_de_aviso(_target uuid)
 returns table(user_id uuid)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with t as (
    select (select m.tenant_id from public.tenant_members m where m.user_id = _target limit 1) as tenant_id,
           public.equipo_de(_target) as equipo,
           -- Avisos SOBRE un supervisor o jefe (Alvaro, 13/11/2026): solo dueño,
           -- admins y RR. HH.; no le llegan a sus pares.
           (coalesce((select p.nivel from public.profiles p where p.id = _target) in ('supervisor', 'manager', 'admin', 'dueno'), false)
             or exists (select 1 from public.equipos_a_cargo e where e.user_id = _target)) as es_jefe,
           -- …salvo los supervisores anfitriones en todos los Coworks (Alvaro,
           -- 16/11/2026): entre ellos sí se enteran.
           (exists (select 1 from public.cowork_anfitriones_en_todas a where a.user_id = _target)
             and coalesce((select p.nivel from public.profiles p where p.id = _target) in ('supervisor', 'manager'), false)) as sup_en_todas
  ),
  miembros as (
    select p.id
      from public.profiles p
      join public.tenant_members m on m.user_id = p.id
      join t on m.tenant_id = t.tenant_id
     where p.deleted_at is null
  )
  select distinct d.uid
    from (
      -- Dueño(s) de la empresa: todo.
      select o.user_id as uid from public.tenant_owners o, t where o.tenant_id = t.tenant_id
      union
      -- Admins: todo.
      select ur.user_id from public.user_roles ur
       where lower(ur.role) = 'admin' and ur.user_id in (select id from miembros)
      union
      -- RR. HH.: todo.
      select h.user_id from public.equipo_rrhh() h, t where h.tenant_id = t.tenant_id
      union
      -- Supervisores de su mismo equipo.
      select s.id from public.profiles s, t
       where not t.es_jefe
         and s.nivel = 'supervisor' and s.id in (select id from miembros)
         and t.equipo <> 'Otros' and public.equipo_de(s.id) = t.equipo
      union
      -- Jefes con ese equipo a cargo.
      select e.user_id from public.equipos_a_cargo e, t
       where not t.es_jefe
         and e.equipo = t.equipo and e.user_id in (select id from miembros)
      union
      -- Los otros supervisores anfitriones en todos los Coworks.
      select a.user_id from public.cowork_anfitriones_en_todas a
        join public.profiles s on s.id = a.user_id, t
       where t.sup_en_todas
         and s.nivel in ('supervisor', 'manager')
         and a.user_id in (select id from miembros)
    ) d
   where d.uid is not null and d.uid <> _target;
$function$;
