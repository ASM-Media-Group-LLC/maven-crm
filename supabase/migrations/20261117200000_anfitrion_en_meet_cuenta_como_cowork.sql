-- EL ANFITRIÓN EN UN MEET DE MAVEN CUENTA COMO TRABAJO (Alvaro, 17/11/2026).
--
-- Qué pasaba: Luis (anfitrión) estuvo en un Meet de Maven (meet_687f…) de 14:42
-- a 16:15 hora UTC, con su llamada sana minuto a minuto (llamada_salud). Al salir
-- de la reunión, el vigía «fuera de Cowork» le abrió un episodio que EMPEZABA a
-- las 15:00 (inicio del turno): el «desde» se calcula con el último tramo del
-- reloj de Cowork (14:42, cuando dejó el Hub) y no sabía nada de la reunión. Toda
-- la reunión quedó como «fuera», con su aviso, los llamados de Argos y la nota.
-- Además, el tiempo de la reunión no sumaba en cowork_tiempo_segmentos.
--
-- Qué cambia (solo ANFITRIONES de un Cowork; los chatters siguen igual):
--   · latir_llamada_maven(sala): si la sala es de Meet (meet_…) y quien late es
--     anfitrión de una sesión activa, además del latido deja/estira un tramo del
--     reloj con estado 'meet' (cuenta como trabajo) en esa sesión, sin sala.
--     Si otro reloj suyo está vivo (el Hub, una pausa), no lo pisa: manda ese.
--     Con el tramo vivo, presente_en_cowork() lo ve en el Hub, el vigía no abre
--     «fuera» y, si se abre después, empieza cuando terminó la reunión.
--   · salir_llamada_maven(sala): solo borra el latido de ESA llamada (antes
--     cualquier llamada que se cerraba borraba el de otra pestaña) y cierra el
--     tramo de la reunión en su último latido.
--   · Admins y dueño quedan fuera, como en el vigía y en Argos.
--
-- La edge cowork-session también mira esta señal: con el Hub abierto y el
-- anfitrión en un Meet, su reloj marca 'meet' y no «sin cámara»/«sin pantalla».

-- ¿A qué sesión va el tiempo del anfitrión en la reunión? La de su último tramo
-- del día (si sigue activa y sigue siendo anfitrión ahí); si no, la sesión activa
-- donde es anfitrión (membresía 'host', luego cowork_anfitriones, luego las de su
-- agencia si es anfitrión en todas). null = no es anfitrión de nada activo.
create or replace function public.cowork_sesion_de_anfitrion(_uid uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  with activas as (
    select s.id, s.created_at, s.tenant_id
      from public.cowork_sessions s
     where s.status = 'active'
  ),
  suyas as (
    select a.id, 1 as prio, m.joined_at as cuando
      from public.cowork_memberships m
      join activas a on a.id = m.session_id
     where m.user_id = _uid and m.role = 'host'
    union all
    select a.id, 2, a.created_at
      from public.cowork_anfitriones x
      join activas a on a.id = x.session_id
     where x.user_id = _uid
    union all
    select a.id, 3, a.created_at
      from public.cowork_anfitriones_en_todas e
      join activas a
        on a.tenant_id = (select tm.tenant_id from public.tenant_members tm where tm.user_id = _uid limit 1)
     where e.user_id = _uid
  )
  select coalesce(
    (select t.session_id
       from public.cowork_tiempo_segmentos t
      where t.user_id = _uid
        and t.last_seen_at > now() - interval '16 hours'
        and t.session_id in (select id from suyas)
      order by t.last_seen_at desc
      limit 1),
    (select id from suyas order by prio, cuando desc nulls last limit 1)
  );
$$;
revoke all on function public.cowork_sesion_de_anfitrion(uuid) from public, anon, authenticated;

-- La llamada (que no es Cowork) late mientras está abierta. Si es un Meet y quien
-- late es anfitrión, su reloj de Cowork corre como 'meet'.
create or replace function public.latir_llamada_maven(_sala text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ahora timestamptz := now();
  v_sesion uuid;
  v_abierto record;
begin
  if v_uid is null then return; end if;

  insert into public.llamada_maven_latido (user_id, sala, last_seen_at)
  values (v_uid, left(_sala, 200), v_ahora)
  on conflict (user_id) do update set sala = excluded.sala, last_seen_at = excluded.last_seen_at;

  -- Solo reuniones de Meet (las de Cowork son cowork_…, las del chat call-…).
  if _sala is null or left(_sala, 5) <> 'meet_' then return; end if;
  if public.es_admin_o_dueno(v_uid) then return; end if;
  v_sesion := public.cowork_sesion_de_anfitrion(v_uid);
  if v_sesion is null then return; end if;

  -- El reloj nunca rompe el latido de la llamada: cualquier falla aquí (una
  -- carrera con el latido del Hub por el «un tramo abierto por persona», la
  -- guarda de agencia) se deja pasar y el próximo latido lo intenta de nuevo.
  begin
    select s.id, s.estado, s.room_id, s.last_seen_at
      into v_abierto
      from public.cowork_tiempo_segmentos s
     where s.user_id = v_uid and s.ended_at is null
     for update;

    if found then
      if v_abierto.last_seen_at > v_ahora - interval '90 seconds' then
        -- Ya hay un tramo vivo. Si es el de la reunión (o el Hub ya marca
        -- 'meet'), se estira; si es otro (el Hub con todo prendido, una pausa),
        -- manda ese y no se pisa.
        if v_abierto.estado = 'meet' and v_abierto.room_id is null then
          update public.cowork_tiempo_segmentos set last_seen_at = v_ahora where id = v_abierto.id;
        end if;
        return;
      end if;
      -- Vencido: termina en su último latido, como en la edge.
      update public.cowork_tiempo_segmentos set ended_at = v_abierto.last_seen_at where id = v_abierto.id;
    end if;

    insert into public.cowork_tiempo_segmentos
      (session_id, room_id, user_id, estado, detalle, started_at, last_seen_at, equipo)
    values (v_sesion, null, v_uid, 'meet', 'meet_maven', v_ahora, v_ahora, 'meet_maven');
  exception when others then
    null;
  end;
end;
$$;
revoke all on function public.latir_llamada_maven(text) from public, anon;
grant execute on function public.latir_llamada_maven(text) to authenticated;

-- Salir: solo el latido de ESA llamada (si viene la sala) y el tramo de la
-- reunión se cierra en su último latido. Sin sala (versiones anteriores de la
-- app), como antes: borra el latido.
drop function if exists public.salir_llamada_maven();
create or replace function public.salir_llamada_maven(_sala text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return; end if;
  delete from public.llamada_maven_latido
   where user_id = v_uid and (_sala is null or sala = left(_sala, 200));
  if _sala is null or left(_sala, 5) = 'meet_' then
    update public.cowork_tiempo_segmentos
       set ended_at = last_seen_at
     where user_id = v_uid and ended_at is null and equipo = 'meet_maven';
  end if;
end;
$$;
revoke all on function public.salir_llamada_maven(text) from public, anon;
grant execute on function public.salir_llamada_maven(text) to authenticated;
