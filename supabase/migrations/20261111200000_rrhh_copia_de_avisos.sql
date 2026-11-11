-- RECURSOS HUMANOS RECIBE COPIA DE LOS AVISOS DE LOS EMPLEADOS (Alvaro, 11/11/2026).
--
-- «Darle una copia a la persona de recursos humanos que esté viendo lo que está
-- pasando, así como recibo yo en el teléfono… asegúrate que ellas también lo ven».
--
-- Hasta hoy los dos avisos de vigilancia le llegaban SOLO al dueño (y el de Cowork
-- también al supervisor del equipo):
--   · argos_alerta  → lo arma el edge argos-vigia (ahí se suma RR. HH.; ver index.ts).
--   · cowork_fuera  → lo arma vigilar_fuera_de_cowork() (aquí abajo).
-- En 3 días: 436 + 25 al dueño, 0 a RR. HH.
--
-- Y aunque se les mandara, el teléfono no les sonaba: el push es opt-in
-- (notification_settings.push_enabled, false al nacer) y Andrea y Lina no tenían
-- fila de ajustes, así que push_notify_enqueue las saltaba. Se les prende el push
-- (y a quien tenga el rol HHRR), como lo pidió el dueño. Lo pueden apagar en sus
-- ajustes como cualquiera.

set local lock_timeout = '3s';

-- ─── 1. Quién es RR. HH. en cada agencia ─────────────────────────────────────
-- Personas con el rol HHRR (el de RR. HH. en Maven), activas, con su agencia.
-- Interna: la usan vigilar_fuera_de_cowork y argos-vigia (service_role).
create or replace function public.equipo_rrhh()
returns table (tenant_id uuid, user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct tm.tenant_id, p.id
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.deleted_at is null
    join public.tenant_members tm on tm.user_id = p.id
   where lower(ur.role) in ('hhrr', 'rrhh', 'recursos humanos');
$$;
revoke all on function public.equipo_rrhh() from public, anon, authenticated;
grant execute on function public.equipo_rrhh() to service_role;

-- ─── 2. «Se salió de Cowork»: también a RR. HH. ──────────────────────────────
-- Igual que en 20261111090000_fuera_de_cowork_sin_pisarse.sql; solo cambia la
-- lista de a quién se avisa (paso 3): dueño + supervisor del equipo + RR. HH.
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
        union
        -- RR. HH. de la agencia (copia de lo que ve el dueño), menos la persona misma.
        select h.user_id, '/hr/monitor-ia?t=donde'
          from public.equipo_rrhh() h
         where h.tenant_id = r.tenant_id and h.user_id <> r.user_id
           and not exists (select 1 from public.tenant_owners o3 where o3.user_id = h.user_id and o3.tenant_id = r.tenant_id)
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
$function$;

-- ─── 3. Que les suene el teléfono, como al dueño ─────────────────────────────
insert into public.notification_settings (user_id, push_enabled, notifications_enabled)
select distinct h.user_id, true, true from public.equipo_rrhh() h
on conflict (user_id) do update
  set push_enabled = true, notifications_enabled = true, updated_at = now();
