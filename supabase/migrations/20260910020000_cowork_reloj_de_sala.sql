-- ═══════════════════════════════════════════════════════════════════════════
-- RELOJ DE RESPALDO PARA EL TABLERO DEL SUPERVISOR
--
-- Jhon (10/09/2026): "Camila Sogamoso aparece con puntico gris y sin contador".
-- Camila estaba trabajando: su video se veía y su latido llegaba cada 30 s por
-- HTTP. Lo que no llegaba era su PRESENCIA de Realtime, que es de donde el
-- tablero sacaba el punto verde y el contador. Realtime ya nos tiró el socket
-- por límite de presencia y por JWT vencido; el latido nunca falló.
--
-- Esta función le da al tablero el reloj desde lo que el latido YA guardó en
-- `cowork_tiempo_segmentos`, para que cuando la presencia falte el contador
-- siga ahí y el punto diga la verdad. Solo para hosts de la sesión.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.cowork_reloj_de_sala(_session_id uuid)
returns table (
  user_id uuid,
  seg_activo_hoy int,
  ultimo_estado text,
  ultimo_latido timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with dia as (
    select ((now() at time zone 'America/Bogota')::date)::timestamp at time zone 'America/Bogota' as ini
  ),
  gente as (
    select distinct a.user_id
    from public.cowork_room_assignments a
    where a.session_id = _session_id and a.is_active
  ),
  activo as (
    select s.user_id,
           sum(extract(epoch from (
             least(coalesce(s.ended_at, s.last_seen_at), now()) - greatest(s.started_at, d.ini)
           )))::int as seg
    from public.cowork_tiempo_segmentos s
    cross join dia d
    join gente g on g.user_id = s.user_id
    where s.estado = 'activo'
      and coalesce(s.ended_at, s.last_seen_at) > d.ini
    group by s.user_id
  ),
  ultimo as (
    select distinct on (s.user_id) s.user_id, s.estado, s.last_seen_at
    from public.cowork_tiempo_segmentos s
    join gente g on g.user_id = s.user_id
    order by s.user_id, s.last_seen_at desc
  )
  select g.user_id,
         coalesce(a.seg, 0) as seg_activo_hoy,
         u.estado as ultimo_estado,
         u.last_seen_at as ultimo_latido
  from gente g
  left join activo a on a.user_id = g.user_id
  left join ultimo u on u.user_id = g.user_id
  where public.is_cowork_host(auth.uid(), _session_id)
$$;

comment on function public.cowork_reloj_de_sala(uuid) is
  'Reloj de respaldo del tablero: segundos activos de HOY (Bogotá), último estado y último latido de cada persona asignada a la sesión. Para cuando la presencia de Realtime no llega. Solo hosts.';
revoke all on function public.cowork_reloj_de_sala(uuid) from public, anon;
grant execute on function public.cowork_reloj_de_sala(uuid) to authenticated;
