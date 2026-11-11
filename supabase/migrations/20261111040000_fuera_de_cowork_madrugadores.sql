-- «FUERA DE COWORK»: el que llega temprano SÍ cuenta (11/11/2026, 00:15).
--
-- El arreglo de anoche (20261111030000) dejaba fuera a cualquiera con algo de
-- Cowork entre 8 h y 90 min antes de su turno: evitó los avisos falsos de Karem
-- y Diego (horarios mal cargados: trabajaron un turno ENTERO antes del suyo),
-- pero también tapaba al que llega una o dos horas temprano y luego se va en
-- mitad de su turno. Y un tramo largo que empezaba antes del turno (llegó
-- temprano y siguió de corrido) no contaba como «entró», así que al irse nunca
-- se marcaba.
--
-- Regla nueva: entró para ESTE turno si estuvo en Cowork desde 30 min antes del
-- inicio (cualquier tramo que siga vivo a esa hora, aunque haya empezado antes),
-- salvo que venga de 4 horas o más de Cowork en las 10 h anteriores al turno
-- (eso es otro turno entero: el horario está mal cargado).

create or replace function public.entro_en_este_turno(_uid uuid, _inicio timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.cowork_tiempo_segmentos s
            where s.user_id = _uid
              and coalesce(s.ended_at, s.last_seen_at) >= _inicio - interval '30 minutes')
     and coalesce((
           select sum(extract(epoch from (least(coalesce(s.ended_at, s.last_seen_at), _inicio) - s.started_at)))
             from public.cowork_tiempo_segmentos s
            where s.user_id = _uid
              and s.started_at >= _inicio - interval '10 hours'
              and s.started_at < _inicio), 0) < 4 * 3600;
$$;

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

  -- 2) Abrir: en su turno, entró PARA ESTE turno, y ahora no está. «ultimo» =
  --    cuándo dejó Cowork (el fin del último tramo que seguía vivo en este turno).
  for r in
    select p.id as uid, tm.tenant_id, t.inicio,
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
