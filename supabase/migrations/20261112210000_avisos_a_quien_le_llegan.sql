-- A QUIÉN LE LLEGAN LOS AVISOS DEL EQUIPO (Alvaro, 12/11/2026).
-- «A Andrea (RR. HH.) le tiene que llegar todo lo que está pasando de todo el
--  equipo. A los admin también. A Daniel, Breyner y Vanessa, la del equipo de
--  chatters. A Luis, la de chatters, la de PR y la de los coordinadores
--  (= Editores).»
--
-- Antes cada aviso decidía distinto (salió de Cowork: dueño + supervisores del
-- equipo + RR. HH.; cortes de llamada: solo supervisores del equipo; cámara:
-- TODOS los supervisor_or_above, de cualquier equipo; alertas de Argos: dueño +
-- RR. HH.). Ahora hay UNA regla, destinatarios_de_aviso(persona):
--   dueño(s) + admins + RR. HH. (todo el equipo)
--   + supervisores de su mismo equipo
--   + jefes que tienen ese equipo a cargo (equipos_a_cargo: Luis → Chatters, PR, Editores).
-- Y los jefes con equipos a cargo también pueden abrir Argos y la vista en vivo
-- de esa gente (si no, el aviso los mandaría a una puerta cerrada).

-- 1) Equipos a cargo de un jefe (para quien no es supervisor de un solo equipo).
create table if not exists public.equipos_a_cargo (
  user_id uuid not null references public.profiles(id) on delete cascade,
  equipo text not null,
  tenant_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, equipo)
);
alter table public.equipos_a_cargo enable row level security;
create policy equipos_a_cargo_sel on public.equipos_a_cargo
  for select to authenticated
  using (user_id = (select auth.uid()) or public.es_admin_o_dueno((select auth.uid())));

-- Luis Carlos Ortega Roman (manager de Operaciones).
insert into public.equipos_a_cargo (user_id, equipo, tenant_id) values
  ('41b35cef-82a8-4991-9234-3514b0064767', 'Chatters', '30869615-f579-4981-8a1f-dbebc61eae2d'),
  ('41b35cef-82a8-4991-9234-3514b0064767', 'PR',       '30869615-f579-4981-8a1f-dbebc61eae2d'),
  ('41b35cef-82a8-4991-9234-3514b0064767', 'Editores', '30869615-f579-4981-8a1f-dbebc61eae2d')
on conflict do nothing;

-- 2) LA regla: a quién le llega un aviso sobre _target (nunca a la persona misma).
create or replace function public.destinatarios_de_aviso(_target uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  with t as (
    select (select m.tenant_id from public.tenant_members m where m.user_id = _target limit 1) as tenant_id,
           public.equipo_de(_target) as equipo
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
       where s.nivel = 'supervisor' and s.id in (select id from miembros)
         and t.equipo <> 'Otros' and public.equipo_de(s.id) = t.equipo
      union
      -- Jefes con ese equipo a cargo.
      select e.user_id from public.equipos_a_cargo e, t
       where e.equipo = t.equipo and e.user_id in (select id from miembros)
    ) d
   where d.uid is not null and d.uid <> _target;
$$;
revoke all on function public.destinatarios_de_aviso(uuid) from public, anon, authenticated;

-- 3) Lo que el jefe puede ver: su gente (los de sus equipos a cargo).
create or replace function public.mi_equipo_supervisado()
returns table(user_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  with yo as (
    select p.id, public.equipo_de(p.id) as equipo
    from public.profiles p
    where p.id = (select auth.uid())
      and p.nivel = 'supervisor'
      and p.deleted_at is null
  )
  select t.id
  from public.profiles t, yo
  where yo.equipo <> 'Otros'
    and t.id <> yo.id
    and t.deleted_at is null
    and t.nivel = 'agente'
    and public.equipo_de(t.id) = yo.equipo
    and exists (
      select 1
      from public.user_roles a
      join public.user_roles b on b.tenant_id = a.tenant_id
      where a.user_id = yo.id and b.user_id = t.id
    )
  union
  -- Jefes con equipos a cargo (Luis → Chatters, PR, Editores): todos los de esos
  -- equipos que no son admin ni dueño, de su misma agencia.
  select t.id
  from public.profiles t
  where t.deleted_at is null
    and t.id <> (select auth.uid())
    and not public.es_admin_o_dueno(t.id)
    and public.equipo_de(t.id) in (select e.equipo from public.equipos_a_cargo e where e.user_id = (select auth.uid()))
    and exists (
      select 1
      from public.user_roles a
      join public.user_roles b on b.tenant_id = a.tenant_id
      where a.user_id = (select auth.uid()) and b.user_id = t.id
    );
$$;

create or replace function public.puede_vigilar_a(_viewer uuid, _target uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select _viewer is not null and _target is not null and _viewer <> _target
     and exists (select 1 from public.profiles t where t.id = _target and t.deleted_at is null)
     and (
       public.es_admin_o_dueno(_viewer)
       or (public.es_rh(_viewer) and not public.es_admin_o_dueno(_target))
       -- Supervisor → agentes de su equipo y de su agencia (= mi_equipo_supervisado).
       or exists (
         select 1
           from public.profiles s
           join public.profiles t on t.id = _target and t.nivel = 'agente' and t.deleted_at is null
          where s.id = _viewer and s.nivel = 'supervisor' and s.deleted_at is null
            and public.equipo_de(s.id) <> 'Otros'
            and public.equipo_de(s.id) = public.equipo_de(t.id)
            and exists (
              select 1 from public.user_roles a
                join public.user_roles b on b.tenant_id = a.tenant_id
               where a.user_id = s.id and b.user_id = t.id
            )
       )
       -- Jefe con ese equipo a cargo (no admins ni dueño), de su agencia.
       or (
         not public.es_admin_o_dueno(_target)
         and exists (select 1 from public.equipos_a_cargo e where e.user_id = _viewer and e.equipo = public.equipo_de(_target))
         and exists (
           select 1 from public.user_roles a
             join public.user_roles b on b.tenant_id = a.tenant_id
            where a.user_id = _viewer and b.user_id = _target
         )
       )
     );
$$;

create or replace function public.ve_argos()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(public.es_admin_o_dueno((select auth.uid())), false)
      or coalesce(public.es_rh((select auth.uid())), false)
      or exists (
        select 1 from public.profiles p
         where p.id = (select auth.uid()) and p.nivel = 'supervisor' and p.deleted_at is null
      )
      or exists (select 1 from public.equipos_a_cargo e where e.user_id = (select auth.uid()));
$$;

-- 4) Los avisos usan LA regla.

-- 4a) Cámara (trigger de monitor_eventos): antes a TODOS los supervisor_or_above.
create or replace function public.notificar_supervisores_monitor()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_avisar boolean;
  v_nombre text;
  v_titulo text;
  v_detalle text;
  sup record;
begin
  if new.tipo not in ('camara_apagada', 'se_fue', 'celular', 'distraido', 'no_mira') then
    return new;
  end if;

  select avisar_supervisor into v_avisar from public.monitor_config where id = 1;
  if coalesce(v_avisar, false) = false then
    return new;
  end if;

  if exists (
    select 1 from public.notifications n
    where n.type = 'monitor_ia'
      and n.reference_id = new.user_id::text
      and n.created_at > now() - interval '15 minutes'
  ) then
    return new;
  end if;

  select full_name into v_nombre from public.profiles where id = new.user_id;
  v_detalle := case new.tipo
    when 'camara_apagada' then 'tiene la cámara apagada'
    when 'se_fue'         then 'no está frente a la cámara'
    when 'celular'        then 'parece estar en el celular'
    when 'distraido'      then 'se ve distraído'
    when 'no_mira'        then 'no está mirando la pantalla'
    else new.tipo
  end;
  v_titulo := coalesce(v_nombre, 'Alguien') || ' ' || v_detalle;

  for sup in
    select d.user_id from public.destinatarios_de_aviso(new.user_id) d
  loop
    insert into public.notifications
      (user_id, type, title, message, reference_id, reference_type, module_origin, deep_link_url, priority)
    values
      (sup.user_id, 'monitor_ia', 'Monitor de cámara', v_titulo,
       new.user_id::text, 'monitor_evento', 'HR', format('/hr/en-vivo/%s', new.user_id), 'high');
  end loop;

  return new;
exception
  when others then
    return new;
end;
$function$;

-- 4b) Cortes de llamada: antes solo los supervisores del equipo.
create or replace function public.vigilar_cortes_de_llamada()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  dx record;
  v_ahora timestamptz := now();
  v_avisos int := 0;
begin
  for r in
    select c.user_id, p.full_name, tm.tenant_id
      from public.llamada_cortes c
      join public.profiles p on p.id = c.user_id and p.deleted_at is null
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = c.user_id limit 1) tm on true
     where c.creado >= v_ahora - interval '1 hour'
       and c.fase in ('parpadeo_ok', 'caida', 'reentrada_agotada', 'recarga')
     group by c.user_id, p.full_name, tm.tenant_id
    having count(*) >= 4
  loop
    continue when public.es_admin_o_dueno(r.user_id);
    continue when exists (select 1 from public.llamada_avisos a
                           where a.user_id = r.user_id and a.creado >= v_ahora - interval '3 hours');

    select * into dx from public.diagnostico_de_llamada(r.user_id, v_ahora - interval '1 hour');
    continue when dx.causa = 'sin_datos';

    insert into public.llamada_avisos (user_id, cortes, causa, detalle)
    values (r.user_id, dx.cortes, dx.causa, to_jsonb(dx));

    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (r.user_id, 'llamada_cortes_tu',
            format('Se te cortó la llamada %s veces en la última hora', dx.cortes),
            public.consejo_de_llamada(dx.causa, dx.subida_kbps, dx.rtt_ms, dx.perdida_pct),
            'cowork', 'Cowork', 'normal', 'new', 'personal', '/cowork');

    insert into public.notifications
      (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    select d.user_id, 'llamada_cortes',
           format('A %s se le cortó la llamada %s veces en la última hora',
                  coalesce(nullif(trim(r.full_name), ''), 'un empleado'), dx.cortes),
           format('Causa probable: %s.%s', public.causa_de_llamada_corta(dx.causa),
                  case when dx.nav is not null then format(' Equipo: %s%s.', dx.nav,
                       case when dx.nucleos is not null then format(', %s núcleos', dx.nucleos) else '' end) else '' end),
           r.user_id, 'profile', 'Cowork', 'normal', 'new', 'personal', '/dashboard'
      from public.destinatarios_de_aviso(r.user_id) d;

    v_avisos := v_avisos + 1;
  end loop;
  return v_avisos;
end;
$function$;

-- 4c) Salió de Cowork: antes dueño + supervisores del equipo + RR. HH.
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
       and not public.es_admin_o_dueno(p.id)
       and not coalesce((select h.exento from public.horario_de(p.id) h), false)
       and not exists (select 1 from public.cowork_fuera f where f.user_id = p.id and f.hasta is null)
  loop
    continue when r.ultimo is null;
    continue when public.presente_en_cowork(r.uid, v_ahora);
    continue when greatest(r.ultimo, r.inicio) >= r.fin - interval '10 minutes';
    -- Nunca antes de que cerrara el episodio anterior: si volvió un instante y
    -- se fue de nuevo, el nuevo empieza al cerrar el otro (antes se pisaban y
    -- esos minutos contaban dos veces; Lina Pérez, 11/11).
    insert into public.cowork_fuera (user_id, tenant_id, desde)
    values (r.uid, r.tenant_id, greatest(r.ultimo, r.inicio,
            coalesce((select max(f.hasta) from public.cowork_fuera f where f.user_id = r.uid), r.inicio)))
    on conflict do nothing;
  end loop;

  -- 3) Avisar a quien lleva 1 minuto o más fuera. El aviso abre la vista en vivo
  --    de esa persona con esta salida arriba (Alvaro, 11/11). A quién: LA regla
  --    (destinatarios_de_aviso, 12/11).
  for r in
    select f.id, f.user_id, f.tenant_id, f.desde, p.full_name, h.entrada, h.salida
      from public.cowork_fuera f
      join public.profiles p on p.id = f.user_id
      left join lateral public.horario_de(f.user_id) h on true
     where f.hasta is null and f.avisado_at is null and f.desde <= v_ahora - interval '1 minute'
  loop
    insert into public.notifications
      (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    select d.user_id, 'cowork_fuera',
           format('%s se salió de Cowork', coalesce(nullif(trim(r.full_name), ''), 'Un empleado')),
           format('Está en su turno (%s–%s) y salió de la llamada a las %s. Cuenta como «fuera de Cowork» hasta que vuelva.',
                  to_char(r.entrada, 'HH24:MI'), to_char(r.salida, 'HH24:MI'), to_char(r.desde at time zone 'America/Bogota', 'HH24:MI')),
           r.user_id, 'profile', 'HR', 'high', 'new', 'personal',
           format('/hr/en-vivo/%s?fuera=%s', r.user_id, r.id)
      from public.destinatarios_de_aviso(r.user_id) d;

    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (r.user_id, 'cowork_fuera_tu', 'Saliste de Cowork en tu turno',
            'Vuelve a entrar a Cowork y comparte tu pantalla completa. Mientras estés fuera cuenta en tu nota.',
            'cowork', 'Cowork', 'high', 'new', 'personal', '/cowork');

    update public.cowork_fuera set avisado_at = v_ahora where id = r.id;
    v_avisos := v_avisos + 1;
  end loop;

  return v_avisos;
end;
$function$;
