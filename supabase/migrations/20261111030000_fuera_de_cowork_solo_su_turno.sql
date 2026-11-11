-- «FUERA DE COWORK» SOLO CUENTA SI ENTRÓ PARA ESTE TURNO (10/11/2026, 10:50 p. m.).
--
-- El primer aviso en producción fue falso: Karem Gomez trabajó de 7:57 a 16:12,
-- pero en Maven su turno es de 16:00 a 00:00. Su última conexión (15:38–16:12)
-- caía dentro de «este turno» y el vigía leyó que se salió de la tarde.
--
-- Regla nueva: entró para ESTE turno si se conectó desde 30 min antes del
-- inicio y NO venía trabajando desde horas antes (nada que empiece entre 8 h y
-- 90 min antes del inicio). Quien viene de otro horario (o tiene mal cargado el
-- suyo) no dispara «se salió»; en el tablero sale «No ha entrado» hasta que se
-- le corrija el horario. Además se borra el episodio falso de Karem.

create or replace function public.entro_en_este_turno(_uid uuid, _inicio timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.cowork_tiempo_segmentos s
            where s.user_id = _uid and s.started_at >= _inicio - interval '30 minutes')
     and not exists (
           select 1 from public.cowork_tiempo_segmentos s
            where s.user_id = _uid
              and s.started_at >= _inicio - interval '8 hours'
              and s.started_at <  _inicio - interval '90 minutes');
$$;
revoke all on function public.entro_en_este_turno(uuid, timestamptz) from public, anon;
grant execute on function public.entro_en_este_turno(uuid, timestamptz) to authenticated;

create or replace function public.vigilar_fuera_de_cowork()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_ahora timestamptz := now();
  v_avisos int := 0;
begin
  -- 1) Cerrar: volvió a Cowork, o se le acabó el turno.
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

  -- 2) Abrir: en su turno, entró PARA ESTE turno, y ahora no está.
  for r in
    select p.id as uid, tm.tenant_id, t.inicio,
           (select max(coalesce(s.ended_at, s.last_seen_at)) from public.cowork_tiempo_segmentos s
             where s.user_id = p.id and s.started_at >= t.inicio - interval '30 minutes') as ultimo
      from public.profiles p
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = p.id limit 1) tm on true
      cross join lateral public.turno_en_curso(p.id, v_ahora) t
     where p.deleted_at is null
       and not public.es_admin_o_dueno(p.id)
       and not coalesce((select h.exento from public.horario_de(p.id) h), false)
       and not exists (select 1 from public.cowork_fuera f where f.user_id = p.id and f.hasta is null)
  loop
    continue when r.ultimo is null;
    continue when not public.entro_en_este_turno(r.uid, r.inicio);
    continue when public.presente_en_cowork(r.uid, v_ahora);
    insert into public.cowork_fuera (user_id, tenant_id, desde)
    values (r.uid, r.tenant_id, greatest(r.ultimo, r.inicio))
    on conflict do nothing;
  end loop;

  -- 3) Avisar a quien lleva 1 minuto o más fuera.
  for r in
    select f.id, f.user_id, f.tenant_id, f.desde, p.full_name, h.entrada, h.salida
      from public.cowork_fuera f
      join public.profiles p on p.id = f.user_id
      left join lateral public.horario_de(f.user_id) h on true
     where f.hasta is null and f.avisado_at is null and f.desde <= v_ahora - interval '1 minute'
  loop
    insert into public.notifications
      (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    select d.uid, 'cowork_fuera',
           format('%s se salió de Cowork', coalesce(nullif(trim(r.full_name), ''), 'Un empleado')),
           format('Está en su turno (%s–%s) y salió de la llamada a las %s. Cuenta como «fuera de Cowork» hasta que vuelva.',
                  to_char(r.entrada, 'HH24:MI'), to_char(r.salida, 'HH24:MI'), to_char(r.desde at time zone 'America/Bogota', 'HH24:MI')),
           r.user_id, 'profile', 'HR', 'high', 'new', 'personal', d.link
      from (
        select o.user_id as uid, '/hr/monitor-ia?t=donde' as link
          from public.tenant_owners o where o.tenant_id = r.tenant_id
        union
        select s.id, '/dashboard'
          from public.profiles s
          join public.tenant_members sm on sm.user_id = s.id and sm.tenant_id = r.tenant_id
         where s.nivel = 'supervisor' and s.deleted_at is null and s.id <> r.user_id
           and public.equipo_de(s.id) = public.equipo_de(r.user_id)
           and not exists (select 1 from public.tenant_owners o2 where o2.user_id = s.id and o2.tenant_id = r.tenant_id)
      ) d;

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
$$;
revoke all on function public.vigilar_fuera_de_cowork() from public, anon, authenticated;

-- El tablero usa la misma regla: si no entró para este turno, «No ha entrado».
create or replace function public.donde_esta_cada_uno()
returns table (
  user_id uuid, nombre text, puesto text, equipo text,
  entrada time, salida time, en_turno boolean,
  estado text, estado_desde timestamptz, ultimo_latido timestamptz,
  pantalla_at timestamptz, pantalla_que text, pantalla_fuera_de_lugar boolean, captura_at timestamptz,
  fuera_hoy_veces integer, fuera_hoy_min integer, exento boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid := public.current_tenant_id();
  v_todos boolean;
  v_hoy timestamptz := date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota';
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  v_todos := public.es_admin_o_dueno(v_uid) or coalesce(public.es_rh(v_uid), false);

  return query
  with gente as (
    select p.id, p.full_name
      from public.profiles p
      join public.tenant_members m on m.user_id = p.id and m.tenant_id = v_tenant
     where p.deleted_at is null
       and not public.es_admin_o_dueno(p.id)
       and (v_todos or p.id in (select s.user_id from public.mi_equipo_supervisado() s))
  )
  select g.id,
         g.full_name,
         (select string_agg(distinct ur.role, ' + ') from public.user_roles ur where ur.user_id = g.id),
         public.equipo_de(g.id),
         h.entrada, h.salida,
         (t.inicio is not null),
         case
           when seg.estado is not null then seg.estado
           when br.started_at is not null then 'pausa'
           when f.desde is not null then 'fuera_de_cowork'
           when t.inicio is not null and not public.entro_en_este_turno(g.id, t.inicio) then 'no_ha_entrado'
           when t.inicio is not null then 'fuera_de_cowork'
           else 'fuera_de_turno'
         end,
         coalesce(seg.started_at, br.started_at, f.desde),
         (select max(s3.last_seen_at) from public.cowork_tiempo_segmentos s3 where s3.user_id = g.id and s3.started_at > now() - interval '2 days'),
         cap.created_at, cap.veredicto, cap.fuera_de_lugar,
         capx.created_at,
         coalesce(fh.veces, 0), coalesce(fh.minutos, 0),
         coalesce(h.exento, false)
    from gente g
    left join lateral public.horario_de(g.id) h on true
    left join lateral public.turno_en_curso(g.id) t on true
    left join lateral (
      select s.estado, s.started_at from public.cowork_tiempo_segmentos s
       where s.user_id = g.id and s.ended_at is null and s.last_seen_at > now() - interval '90 seconds'
       order by s.started_at desc limit 1
    ) seg on true
    left join lateral (
      select b.started_at from public.cowork_breaks b
       where b.user_id = g.id and b.ended_at is null and b.started_at > now() - interval '4 hours'
       order by b.started_at desc limit 1
    ) br on true
    left join lateral (
      select x.desde from public.cowork_fuera x where x.user_id = g.id and x.hasta is null limit 1
    ) f on true
    left join lateral (
      select c.created_at, c.veredicto, c.fuera_de_lugar from public.monitor_capturas c
       where c.user_id = g.id and c.tipo = 'pantalla' and c.veredicto is not null and c.created_at > now() - interval '12 hours'
       order by c.created_at desc limit 1
    ) cap on true
    left join lateral (
      select c.created_at from public.monitor_capturas c
       where c.user_id = g.id and c.tipo = 'pantalla' and c.created_at > now() - interval '12 hours'
       order by c.created_at desc limit 1
    ) capx on true
    left join lateral (
      select count(*)::int as veces,
             coalesce(round(sum(extract(epoch from (coalesce(x.hasta, now()) - x.desde))) / 60), 0)::int as minutos
        from public.cowork_fuera x where x.user_id = g.id and x.desde >= v_hoy
    ) fh on true
   order by g.full_name;
end;
$$;
revoke all on function public.donde_esta_cada_uno() from public, anon;
grant execute on function public.donde_esta_cada_uno() to authenticated;

-- El episodio falso de Karem Gomez (turno cargado 16–00, trabajó 7:57–16:12).
delete from public.cowork_fuera f
 using public.profiles p
 where p.id = f.user_id and p.full_name = 'Karem Gomez'
   and f.desde between '2026-11-10 21:00+00' and '2026-11-10 21:30+00'
   and f.hasta is null;
