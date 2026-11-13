-- UN COWORK POR DEPARTAMENTO + TODOS ADENTRO (Alvaro, 13/11/2026).
-- «Necesito que cada departamento tenga su cowork. Todos están en un cowork. Nadie
--  puede estar fuera de un cowork… y si no, que no puedan entrar.» «Breyner, Vanessa y
--  Daniel no van a ir a otro cowork a ver qué está haciendo alguien más: para eso o
--  designo yo a alguien, o solo el admin y el dueño.»
--
-- Decidido en preguntas:
--   · Libres de estar en Cowork (no se les bloquea Maven): admins, dueño, Luis, Daniel
--     Ospina, Breyner Garzon y Vanessa Giraldo. Todos los demás, SIEMPRE que abran Maven.
--   · Coworks: CHATTERS KASH (solo chatters), EDITORES, PR (era MANAGERS), CLOSERS (era
--     CIERRES - MARKETING), WARMING (era letshoot), CONTABILIDAD, RR. HH. (era HR), QA,
--     FREELANCE. Se cierran BRAYAN Y DANIEL y UNIVERSIDAD KASH.
--   · Anfitriones: admins y dueño en todas; CHATTERS KASH también Daniel, Breyner,
--     Vanessa y Luis; PR y EDITORES también Luis. Nadie más.

-- 0) Copia de cómo estaba todo, por si hay que volver atrás.
create table if not exists public.cowork_memberships_respaldo_20261113 as
  select * from public.cowork_memberships;
alter table public.cowork_memberships_respaldo_20261113 enable row level security;

-- 1) Quién no tiene que estar en Cowork (además de admins y dueño).
create table if not exists public.cowork_libres (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.cowork_libres enable row level security;
insert into public.cowork_libres (user_id) values
  ('41b35cef-82a8-4991-9234-3514b0064767'),  -- Luis Carlos Ortega Roman
  ('4d502376-eb16-42f6-bda2-4b92582a26e6'),  -- Daniel Ospina
  ('81da74ae-138b-4229-a7cd-8d079879e7c5'),  -- Breyner Garzon
  ('443bf3bd-7475-4a90-a405-71444a5be34c')   -- Vanessa Giraldo
on conflict do nothing;

create or replace function public.debe_estar_en_cowork(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select _uid is not null
     and not public.es_admin_o_dueno(_uid)
     and not exists (select 1 from public.cowork_libres l where l.user_id = _uid);
$$;
revoke all on function public.debe_estar_en_cowork(uuid) from public, anon;
grant execute on function public.debe_estar_en_cowork(uuid) to authenticated;

-- Lo que la app pregunta para saber si bloquear: ¿debe estar? ¿está?
create or replace function public.mi_cowork_estado()
returns table(debe boolean, presente boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.debe_estar_en_cowork((select auth.uid())),
         public.presente_en_cowork((select auth.uid()), now());
$$;
revoke all on function public.mi_cowork_estado() from public, anon;
grant execute on function public.mi_cowork_estado() to authenticated;

-- 2) Anfitriones por sesión: admins y dueño siempre; los demás, solo si están acá.
create table if not exists public.cowork_anfitriones (
  session_id uuid not null references public.cowork_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (session_id, user_id)
);
alter table public.cowork_anfitriones enable row level security;

create or replace function public.puede_ser_anfitrion(_session uuid, _uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.es_admin_o_dueno(_uid)
      or exists (select 1 from public.cowork_anfitriones a where a.session_id = _session and a.user_id = _uid);
$$;
revoke all on function public.puede_ser_anfitrion(uuid, uuid) from public, anon;

-- Nadie más se vuelve anfitrión por un link: entra como participante.
create or replace function public.cowork_solo_anfitriones_designados()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.role = 'host' and not public.puede_ser_anfitrion(new.session_id, new.user_id) then
    new.role := 'participant';
  end if;
  return new;
end;
$$;
drop trigger if exists cowork_solo_anfitriones_designados on public.cowork_memberships;
create trigger cowork_solo_anfitriones_designados
  before insert or update of role on public.cowork_memberships
  for each row execute function public.cowork_solo_anfitriones_designados();

-- 3) Los Coworks de cada departamento.
--    Se renombran los que ese departamento ya usa (así sus links siguen andando).
update public.cowork_sessions set name = 'PR'       where id = 'ea690a40-187b-47b2-9872-20b83d26e4b2';  -- era MANAGERS
update public.cowork_sessions set name = 'CLOSERS'  where id = 'b553e8b3-5033-4d20-86f8-899f9ea0f42d';  -- era CIERRES - MARKETING
update public.cowork_sessions set name = 'WARMING'  where id = 'ffa5dab1-a5d7-4e5d-ba01-d6ac88297912';  -- era letshoot
update public.cowork_sessions set name = 'RR. HH.'  where id = 'c4de0233-4f44-4c1b-9434-b182b7cf4dc2';  -- era HR

--    Los nuevos, creados a nombre del dueño (queda de anfitrión), con una sala.
insert into public.cowork_sessions (id, name, status, host_hub_livekit_room, created_by) values
  ('9fa8ec28-1369-4d1a-ab83-f9dccdc04181', 'EDITORES',     'active', 'cowork_hub_9fa8ec28', '528453bd-f1e1-43d3-85c1-01c5fa5bbcfb'),
  ('83c48484-c8ff-477c-b087-d63a204d4dda', 'CONTABILIDAD', 'active', 'cowork_hub_83c48484', '528453bd-f1e1-43d3-85c1-01c5fa5bbcfb'),
  ('fda22a31-a0eb-4582-a08c-c12063dc6b55', 'QA',           'active', 'cowork_hub_fda22a31', '528453bd-f1e1-43d3-85c1-01c5fa5bbcfb'),
  ('c4389baf-0667-4603-82f3-7a5329a52422', 'FREELANCE',    'active', 'cowork_hub_c4389baf', '528453bd-f1e1-43d3-85c1-01c5fa5bbcfb')
on conflict (id) do nothing;
insert into public.cowork_rooms (session_id, name, livekit_room_name, sort_order) values
  ('9fa8ec28-1369-4d1a-ab83-f9dccdc04181', 'EDITORES',     'cowork_9fa8ec28_0', 0),
  ('83c48484-c8ff-477c-b087-d63a204d4dda', 'CONTABILIDAD', 'cowork_83c48484_0', 0),
  ('fda22a31-a0eb-4582-a08c-c12063dc6b55', 'QA',           'cowork_fda22a31_0', 0),
  ('c4389baf-0667-4603-82f3-7a5329a52422', 'FREELANCE',    'cowork_c4389baf_0', 0);

--    Se cierran los que ya no van.
update public.cowork_room_assignments set is_active = false
 where is_active and session_id in ('604ef0d0-bfa3-4bce-b233-1a7f9b0a37c0', '6788b03b-bc08-46bf-ad4e-d133f376ebf6');
update public.cowork_sessions
   set status = 'ended', ended_at = now(), ended_by = '528453bd-f1e1-43d3-85c1-01c5fa5bbcfb'
 where id in ('604ef0d0-bfa3-4bce-b233-1a7f9b0a37c0',   -- BRAYAN Y DANIEL
              '6788b03b-bc08-46bf-ad4e-d133f376ebf6');  -- UNIVERSIDAD KASH

-- 4) Anfitriones designados.
insert into public.cowork_anfitriones (session_id, user_id) values
  ('a6bae2d8-7ca5-4046-8f4e-5442d4c084f8', '4d502376-eb16-42f6-bda2-4b92582a26e6'),  -- CHATTERS KASH: Daniel Ospina
  ('a6bae2d8-7ca5-4046-8f4e-5442d4c084f8', '81da74ae-138b-4229-a7cd-8d079879e7c5'),  --                Breyner Garzon
  ('a6bae2d8-7ca5-4046-8f4e-5442d4c084f8', '443bf3bd-7475-4a90-a405-71444a5be34c'),  --                Vanessa Giraldo
  ('a6bae2d8-7ca5-4046-8f4e-5442d4c084f8', '41b35cef-82a8-4991-9234-3514b0064767'),  --                Luis
  ('ea690a40-187b-47b2-9872-20b83d26e4b2', '41b35cef-82a8-4991-9234-3514b0064767'),  -- PR: Luis
  ('9fa8ec28-1369-4d1a-ab83-f9dccdc04181', '41b35cef-82a8-4991-9234-3514b0064767')   -- EDITORES: Luis
on conflict do nothing;

-- 5) Cada quien en el Cowork de su departamento, y solo ahí.
create temp table _destino on commit drop as
select p.id as user_id,
       case
         when p.id = '28b7b909-3956-4a50-b6ff-bffcf7f9537a' then 'fda22a31-a0eb-4582-a08c-c12063dc6b55'::uuid  -- John Idrobo → QA
         when p.id in ('e4df503f-96d6-4810-90ab-3b815408625e',   -- Miguel Garcia
                       '3661183d-2c79-4a6b-86be-515f9ee441c2',   -- Michel Zarate
                       '99705653-0097-4ba7-a7a9-afa040f6ccd5',   -- Lukas Stankus
                       '5abdcda8-2e63-40a2-82a1-918482591ebe',   -- Jaime Baeza
                       'adda098b-e139-41b0-ade8-214d57a56eb0')   -- Brayan Esneider Castaño Hoyos
              then 'c4389baf-0667-4603-82f3-7a5329a52422'::uuid                                              -- → FREELANCE
         else case public.equipo_de(p.id)
                when 'Chatters' then 'a6bae2d8-7ca5-4046-8f4e-5442d4c084f8'::uuid   -- CHATTERS KASH
                when 'Editores' then '9fa8ec28-1369-4d1a-ab83-f9dccdc04181'::uuid   -- EDITORES
                when 'PR'       then 'ea690a40-187b-47b2-9872-20b83d26e4b2'::uuid   -- PR
                when 'Closers'  then 'b553e8b3-5033-4d20-86f8-899f9ea0f42d'::uuid   -- CLOSERS
                when 'Warming'  then 'ffa5dab1-a5d7-4e5d-ba01-d6ac88297912'::uuid   -- WARMING
                when 'Finanzas' then '83c48484-c8ff-477c-b087-d63a204d4dda'::uuid   -- CONTABILIDAD
                when 'RRHH'     then 'c4de0233-4f44-4c1b-9434-b182b7cf4dc2'::uuid   -- RR. HH.
              end
       end as session_id
  from public.profiles p
 where p.deleted_at is null
   and public.debe_estar_en_cowork(p.id)
   and p.id <> '8e3816bf-5a41-4b88-ac4a-f2bd2cf526fb';  -- la cuenta «Test» va a la papelera

--    Fuera los anfitriones que no están designados (incluye cuentas ya dadas de baja).
delete from public.cowork_memberships cm
 using public.cowork_sessions s
 where s.id = cm.session_id and coalesce(s.status, '') <> 'ended'
   and cm.role = 'host' and not public.puede_ser_anfitrion(cm.session_id, cm.user_id);

--    Fuera las membresías de participante en Coworks de otro departamento.
delete from public.cowork_memberships cm
 using _destino d, public.cowork_sessions s
 where d.user_id = cm.user_id and s.id = cm.session_id and coalesce(s.status, '') <> 'ended'
   and cm.role <> 'host' and d.session_id is not null and cm.session_id <> d.session_id;

--    Los libres (Luis, Daniel, Breyner, Vanessa) no son participantes de nadie.
delete from public.cowork_memberships cm
 using public.cowork_libres l
 where l.user_id = cm.user_id and cm.role <> 'host';

--    Cada uno, adentro del suyo.
insert into public.cowork_memberships (session_id, user_id, role)
select d.session_id, d.user_id, 'participant'
  from _destino d
 where d.session_id is not null
   and not exists (select 1 from public.cowork_memberships cm
                    where cm.session_id = d.session_id and cm.user_id = d.user_id);

--    Los anfitriones designados, en su Cowork (Luis en EDITORES todavía no estaba).
insert into public.cowork_memberships (session_id, user_id, role)
select a.session_id, a.user_id, 'host'
  from public.cowork_anfitriones a
 where not exists (select 1 from public.cowork_memberships cm
                    where cm.session_id = a.session_id and cm.user_id = a.user_id);
update public.cowork_memberships cm set role = 'host'
  from public.cowork_anfitriones a
 where a.session_id = cm.session_id and a.user_id = cm.user_id and cm.role <> 'host';

-- 6) Los vigías ya no persiguen a los libres (Luis, Daniel, Breyner, Vanessa): solo a
--    quien debe estar en Cowork (debe_estar_en_cowork ya deja fuera a admins y dueño).
create or replace function public.vigilar_fuera_de_cowork()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_ahora timestamptz := now();
  v_avisos int := 0;
  v_n int;
  v_min int;
  v_nom text;
  v_turno date;
begin
  -- 1) Cerrar: volvió (Cowork, pausa u otra llamada de Maven), o se le acabó el turno.
  for r in select f.id, f.user_id, f.desde from public.cowork_fuera f where f.hasta is null loop
    if public.presente_en_cowork(r.user_id, v_ahora) then
      update public.cowork_fuera set hasta = v_ahora, motivo = 'volvio' where id = r.id;
    elsif not exists (select 1 from public.turno_en_curso(r.user_id, v_ahora)) then
      update public.cowork_fuera
         set hasta = least(v_ahora, coalesce((select t.fin from public.turno_en_curso(r.user_id, r.desde) t), v_ahora)),
             motivo = 'fin_de_turno'
       where id = r.id;
    end if;
  end loop;

  -- 2) Abrir: en su turno, entró para este turno, no está, y no se fue en los
  --    últimos 10 minutos del turno.
  for r in
    select p.id as uid, tm.tenant_id, t.inicio, t.fin,
           (select max(coalesce(s.ended_at, s.last_seen_at)) from public.cowork_tiempo_segmentos s
             where s.user_id = p.id and coalesce(s.ended_at, s.last_seen_at) >= t.inicio - interval '30 minutes') as ultimo
      from public.profiles p
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = p.id limit 1) tm on true
      cross join lateral public.turno_en_curso(p.id, v_ahora) t
     where p.deleted_at is null
       and public.debe_estar_en_cowork(p.id)
       and not coalesce((select h.exento from public.horario_de(p.id) h), false)
       and not exists (select 1 from public.cowork_fuera f where f.user_id = p.id and f.hasta is null)
  loop
    continue when r.ultimo is null;
    continue when public.presente_en_cowork(r.uid, v_ahora);
    continue when greatest(r.ultimo, r.inicio) >= r.fin - interval '10 minutes';
    insert into public.cowork_fuera (user_id, tenant_id, desde)
    values (r.uid, r.tenant_id, greatest(r.ultimo, r.inicio,
            coalesce((select max(f.hasta) from public.cowork_fuera f where f.user_id = r.uid), r.inicio)))
    on conflict do nothing;
  end loop;

  -- 3) Llamados: al minuto el primero, después cada 2 min hasta que vuelva. Al 3ro,
  --    «te estoy reportando» y el aviso a sus jefes (una vez por salida).
  for r in
    select f.id, f.user_id, f.desde, f.llamados, f.reportado_at, p.full_name, h.entrada, h.salida
      from public.cowork_fuera f
      join public.profiles p on p.id = f.user_id
      left join lateral public.horario_de(f.user_id) h on true
     where f.hasta is null and f.desde <= v_ahora - interval '1 minute'
       and (f.ultimo_llamado_at is null or f.ultimo_llamado_at <= v_ahora - interval '110 seconds')
  loop
    v_n := r.llamados + 1;
    v_min := greatest(1, round(extract(epoch from (v_ahora - r.desde)) / 60))::int;

    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (r.user_id, 'cowork_fuera_tu',
            case when v_n >= 3 then 'Te estoy reportando: sigues fuera de Cowork'
                 when v_n = 2 then 'Sigues fuera de Cowork en tu turno'
                 else 'Saliste de Cowork en tu turno' end,
            case when v_n >= 3 then format('Llevas %s min fuera y no volviste. Ya le avisé a tu supervisor. Entra a Cowork ya, con cámara y pantalla.', v_min)
                 else format('Llevas %s min fuera. Entra a Cowork ya, con cámara y pantalla completa. Mientras estés fuera cuenta en tu nota.', v_min) end,
            'cowork', 'Cowork', 'high', 'new', 'personal', '/cowork');

    if v_n >= 3 and r.reportado_at is null then
      insert into public.notifications
        (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
      select d.user_id, 'cowork_fuera',
             format('%s sigue fuera de Cowork', coalesce(nullif(trim(r.full_name), ''), 'Un empleado')),
             format('Está en su turno (%s–%s), salió a las %s y lleva %s min fuera. Argos le hizo 3 llamados y no volvió.',
                    to_char(r.entrada, 'HH24:MI'), to_char(r.salida, 'HH24:MI'),
                    to_char(r.desde at time zone 'America/Bogota', 'HH24:MI'), v_min),
             r.user_id, 'profile', 'HR', 'high', 'new', 'personal',
             format('/hr/en-vivo/%s?fuera=%s', r.user_id, r.id)
        from public.destinatarios_de_aviso(r.user_id) d;
    end if;

    update public.cowork_fuera
       set llamados = v_n, ultimo_llamado_at = v_ahora,
           avisado_at = coalesce(avisado_at, v_ahora),
           reportado_at = case when v_n >= 3 then coalesce(reportado_at, v_ahora) else reportado_at end
     where id = r.id;
    v_avisos := v_avisos + 1;
  end loop;

  -- 4) NUNCA ENTRÓ en su turno (solo con horario propio): a los 10 min de empezar,
  --    llamados cada 2 min; al 3ro, el reporte a sus jefes.
  for r in
    select p.id as uid, p.full_name, tm.tenant_id, t.inicio, h.entrada,
           n.llamados, n.reportado_at
      from public.profiles p
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = p.id limit 1) tm on true
      cross join lateral public.turno_en_curso(p.id, v_ahora) t
      left join lateral public.horario_de(p.id) h on true
      left join public.argos_no_entro n
             on n.user_id = p.id and n.turno = (t.inicio at time zone 'America/Bogota')::date
     where p.deleted_at is null
       and (p.hora_entrada is not null or p.turno_id is not null)
       and public.debe_estar_en_cowork(p.id)
       and not coalesce(h.exento, false)
       and v_ahora >= t.inicio + interval '10 minutes'
       and v_ahora < t.fin - interval '10 minutes'
       and not exists (select 1 from public.cowork_tiempo_segmentos s
                        where s.user_id = p.id and coalesce(s.ended_at, s.last_seen_at) >= t.inicio - interval '30 minutes')
       and (n.ultimo_llamado_at is null or n.ultimo_llamado_at <= v_ahora - interval '110 seconds')
  loop
    continue when public.presente_en_cowork(r.uid, v_ahora);
    v_turno := (r.inicio at time zone 'America/Bogota')::date;
    v_n := coalesce(r.llamados, 0) + 1;
    v_min := greatest(1, round(extract(epoch from (v_ahora - r.inicio)) / 60))::int;
    v_nom := coalesce(nullif(trim(r.full_name), ''), 'Un empleado');

    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (r.uid, 'cowork_no_entro_tu',
            case when v_n >= 3 then 'Te estoy reportando: no has entrado a Cowork'
                 else 'Ya empezó tu turno y no has entrado a Cowork' end,
            case when v_n >= 3 then format('Tu turno empezó a las %s. Ya le avisé a tu supervisor. Entra a Cowork ya, con cámara y pantalla.', to_char(r.entrada, 'HH24:MI'))
                 else format('Tu turno empezó a las %s. Entra a Cowork ya, con cámara y pantalla completa.', to_char(r.entrada, 'HH24:MI')) end,
            'cowork', 'Cowork', 'high', 'new', 'personal', '/cowork');

    if v_n >= 3 and r.reportado_at is null then
      insert into public.notifications
        (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
      select d.user_id, 'cowork_no_entro',
             format('%s no ha entrado a Cowork', v_nom),
             format('Debía entrar a las %s y lleva %s min sin entrar. Argos le hizo 3 llamados.', to_char(r.entrada, 'HH24:MI'), v_min),
             r.uid, 'profile', 'HR', 'high', 'new', 'personal', format('/hr/expediente/%s', r.uid)
        from public.destinatarios_de_aviso(r.uid) d;
    end if;

    insert into public.argos_no_entro (user_id, turno, llamados, ultimo_llamado_at, reportado_at, tenant_id)
    values (r.uid, v_turno, v_n, v_ahora, case when v_n >= 3 then v_ahora end, r.tenant_id)
    on conflict (user_id, turno) do update
      set llamados = excluded.llamados, ultimo_llamado_at = excluded.ultimo_llamado_at,
          reportado_at = coalesce(public.argos_no_entro.reportado_at, excluded.reportado_at);
    v_avisos := v_avisos + 1;
  end loop;

  return v_avisos;
end;
$function$;

create or replace function public.vigilar_tiempo_sin_pantalla()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  j record;
  v_ahora timestamptz := now();
  v_dia date := (now() at time zone 'America/Bogota')::date;
  v_turno date;
  v_sin int;
  v_perm int;
  v_entro boolean;
  v_faltas int;
  v_fotos int;
  v_nom text;
  v_avisos int := 0;
begin
  -- 4a) AL MOMENTO: en su turno, ya entró, y se pasó de lo permitido.
  for r in
    select p.id as uid, p.full_name, tm.tenant_id, t.inicio, t.fin
      from public.profiles p
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = p.id limit 1) tm on true
      cross join lateral public.turno_en_curso(p.id, v_ahora) t
     where p.deleted_at is null
       and public.debe_estar_en_cowork(p.id)
       and not coalesce((select h.exento from public.horario_de(p.id) h), false)
       and exists (select 1 from public.cowork_tiempo_segmentos s
                    where s.user_id = p.id and coalesce(s.ended_at, s.last_seen_at) >= t.inicio - interval '30 minutes')
  loop
    v_turno := (r.inicio at time zone 'America/Bogota')::date;
    continue when exists (select 1 from public.argos_tiempo_avisos a
                           where a.user_id = r.uid and a.turno = v_turno and a.tipo = 'pasado');
    v_perm := public.argos_permitido_min(r.uid);
    v_sin := round(public.argos_sin_pantalla_seg(r.uid, r.inicio, v_ahora) / 60.0);
    continue when v_sin <= v_perm;

    insert into public.argos_tiempo_avisos (user_id, turno, tipo, sin_pantalla_min, permitido_min, tenant_id)
    values (r.uid, v_turno, 'pasado', v_sin, v_perm, r.tenant_id)
    on conflict do nothing;

    v_nom := coalesce(nullif(trim(r.full_name), ''), 'Un empleado');
    insert into public.notifications
      (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    select d.user_id, 'argos_tiempo_pasado',
           format('%s se pasó de su tiempo sin pantalla', v_nom),
           format('Lleva %s min sin pantalla en su turno (%s–%s) y tiene %s permitidos (comida + baño).',
                  v_sin, to_char(r.inicio at time zone 'America/Bogota', 'HH24:MI'),
                  to_char(r.fin at time zone 'America/Bogota', 'HH24:MI'), v_perm),
           r.uid, 'profile', 'HR', 'high', 'new', 'personal', format('/hr/expediente/%s', r.uid)
      from public.destinatarios_de_aviso(r.uid) d;

    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (r.uid, 'argos_tiempo_pasado_tu', 'Te pasaste de tu tiempo sin pantalla',
            format('Llevas %s min sin compartir pantalla en tu turno y tienes %s (comida + baño). Vuelve a Cowork con cámara y pantalla.',
                   v_sin, v_perm),
            'cowork', 'Cowork', 'high', 'new', 'personal', '/cowork');
    v_avisos := v_avisos + 1;
  end loop;

  -- 4b) AL CERRAR EL TURNO: la foto de cada persona cuyo turno terminó hace 10 min
  --     o más (y menos de 3 h), una vez por turno.
  for r in
    select p.id as uid, p.full_name, tm.tenant_id, x.ini, x.fin
      from public.profiles p
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = p.id limit 1) tm on true
      join lateral public.horario_de(p.id) h on h.entrada is not null and h.salida is not null and not coalesce(h.exento, false)
      cross join lateral (
        select ((v_dia + d) + h.entrada) at time zone 'America/Bogota' as ini,
               (case when h.salida <= h.entrada then (v_dia + d + 1) + h.salida else (v_dia + d) + h.salida end)
                 at time zone 'America/Bogota' as fin
          from unnest(array[0, -1]) as d
      ) x
     where p.deleted_at is null
       and public.debe_estar_en_cowork(p.id)
       and x.fin <= v_ahora - interval '10 minutes'
       and x.fin > v_ahora - interval '3 hours'
  loop
    v_turno := (r.ini at time zone 'America/Bogota')::date;
    continue when exists (select 1 from public.argos_tiempo_avisos a
                           where a.user_id = r.uid and a.turno = v_turno and a.tipo = 'resumen');
    v_entro := exists (select 1 from public.cowork_tiempo_segmentos s
                        where s.user_id = r.uid and s.started_at < r.fin
                          and coalesce(s.ended_at, s.last_seen_at) >= r.ini - interval '30 minutes');
    v_perm := public.argos_permitido_min(r.uid);
    v_sin := case when v_entro then round(public.argos_sin_pantalla_seg(r.uid, r.ini, r.fin) / 60.0) else 0 end;
    select count(*) into v_faltas from public.monitor_eventos e
     where e.user_id = r.uid and e.created_at >= r.ini and e.created_at < r.fin;
    select count(*) into v_fotos from public.monitor_capturas c
     where c.user_id = r.uid and c.tipo = 'pantalla' and c.created_at >= r.ini and c.created_at < r.fin;

    insert into public.argos_tiempo_avisos (user_id, turno, tipo, sin_pantalla_min, permitido_min, faltas, fotos, entro, tenant_id, created_at)
    values (r.uid, v_turno, 'resumen', v_sin, v_perm, v_faltas, v_fotos, v_entro, r.tenant_id, v_ahora)
    on conflict do nothing;

    if v_entro then
      insert into public.notifications
        (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
      values (r.uid, 'argos_resumen_turno_tu',
              case when v_sin > v_perm then 'Tu turno: te pasaste de tu tiempo sin pantalla' else 'Tu turno: dentro de tu tiempo' end,
              format('Estuviste %s min sin pantalla de %s permitidos · %s fallas · %s fotos.', v_sin, v_perm, v_faltas, v_fotos),
              'cowork', 'Cowork', 'normal', 'new', 'personal', '/dashboard');
    end if;
  end loop;

  -- 4c) UN resumen por jefe con su gente de este cierre (los que se pasaron arriba).
  --     Si nadie del cierre entró (día libre, festivo), no se manda.
  for j in
    select d.user_id as jefe,
           count(*) filter (where a.entro and a.sin_pantalla_min > a.permitido_min) as pasados,
           count(*) filter (where a.entro and a.sin_pantalla_min <= a.permitido_min) as dentro,
           count(*) filter (where not a.entro) as sin_entrar,
           -- Los 6 que más se pasaron; el resto se cuenta («+3 más»).
           (array_agg(format('%s %s de %s min', trim(split_part(p.full_name, ' ', 1) || ' ' || split_part(p.full_name, ' ', 2)),
                             a.sin_pantalla_min, a.permitido_min)
                      order by (a.sin_pantalla_min - a.permitido_min) desc)
              filter (where a.entro and a.sin_pantalla_min > a.permitido_min))[1:6] as top
      from public.argos_tiempo_avisos a
      join public.profiles p on p.id = a.user_id
      cross join lateral public.destinatarios_de_aviso(a.user_id) d
     where a.tipo = 'resumen' and a.created_at = v_ahora
     group by d.user_id
    having count(*) filter (where a.entro) > 0
  loop
    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (j.jefe, 'argos_resumen_turno',
            case when j.pasados = 0 then 'Resumen del turno: todos dentro de su tiempo'
                 when j.pasados = 1 then 'Resumen del turno: 1 se pasó de su tiempo sin pantalla'
                 else format('Resumen del turno: %s se pasaron de su tiempo sin pantalla', j.pasados) end,
            concat_ws(' ',
                      case when j.top is not null then array_to_string(j.top, ' · ')
                           || case when j.pasados > 6 then format(' · +%s más', j.pasados - 6) else '' end || '.' end,
                      format('%s dentro de su tiempo · %s sin entrar.', j.dentro, j.sin_entrar)),
            'profile', 'HR', 'normal', 'new', 'personal', '/hr/monitor-ia?t=dia');
    v_avisos := v_avisos + 1;
  end loop;

  return v_avisos;
end;
$function$;
