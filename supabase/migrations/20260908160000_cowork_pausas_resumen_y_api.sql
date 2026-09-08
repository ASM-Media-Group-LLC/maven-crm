-- ═══════════════════════════════════════════════════════════════════════════
-- PAUSAS DE COWORK: resumen para el supervisor y detalle para la API pública.
--
-- Pedido del jefe (08/09/2026): "una vista donde marque cuánto tiempo de baño y
-- cuánto de almuerzo tienen, y que la API lo tenga". En la empresa hay DOS
-- pausas: Baño (presupuesto diario, p. ej. 10 min al día) y Break (tope por
-- pausa, lo decide cada supervisor en las reglas de su sesión). El tope que se
-- aplica es el de la sesión (`alert_rules.pausas`) y, si la sesión no tiene
-- reglas propias, el de `cowork_break_limits`.
--
-- Las pausas que cerró el sistema (`auto_closed`: cerró la pestaña y no volvió)
-- se CUENTAN aparte y no suman minutos: una "pausa de 8 horas" arruinaría
-- cualquier total. Solo pausas cerradas; la abierta se ve en vivo en el tablero.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.cowork_pausas_resumen(
  _desde date default null,
  _hasta date default null,
  _session_id uuid default null,
  _user_id uuid default null,
  _limit int default 500,
  _offset int default 0
)
returns table (
  dia date,
  user_id uuid,
  nombre text,
  banos int,
  seg_bano int,
  bano_limite_seg int,
  bano_excedido boolean,
  breaks int,
  seg_break int,
  break_limite_seg int,
  breaks_excedidos int,
  seg_break_de_mas int,
  auto_cerradas int
)
language sql
stable
security definer
set search_path = public
as $$
  with pausas as (
    select
      b.user_id,
      (b.started_at at time zone 'America/Bogota')::date as dia,
      b.kind,
      b.auto_closed,
      coalesce(b.duration_seconds, greatest(0, extract(epoch from (b.ended_at - b.started_at))::int)) as seg,
      -- Tope vigente: el de la sesión, si tiene reglas propias; si no, la tabla.
      coalesce(
        nullif(cs.alert_rules->'pausas'->>(case when b.kind = 'break' then 'breakMin' else 'banoMin' end), '')::int,
        l.minutos
      ) * 60 as limite_seg
    from public.cowork_breaks b
    left join public.cowork_sessions cs on cs.id = b.session_id
    left join public.cowork_break_limits l on l.kind = b.kind
    where b.ended_at is not null
      and (_desde is null or (b.started_at at time zone 'America/Bogota')::date >= _desde)
      and (_hasta is null or (b.started_at at time zone 'America/Bogota')::date <= _hasta)
      and (_session_id is null or b.session_id = _session_id)
      and (_user_id is null or b.user_id = _user_id)
      -- Sin sesión (service_role, API pública) pasa todo. Con sesión: lo propio,
      -- lo de las sesiones que uno hostea, o todo si es supervisor o superior.
      and (
        auth.uid() is null
        or b.user_id = auth.uid()
        or public.is_cowork_host(auth.uid(), b.session_id)
        or public.is_in_role_group(auth.uid(), 'supervisor_or_above')
      )
  ),
  sumas as (
    select
      p.dia, p.user_id,
      count(*) filter (where p.kind = 'bano' and not p.auto_closed)::int as banos,
      coalesce(sum(p.seg) filter (where p.kind = 'bano' and not p.auto_closed), 0)::int as seg_bano,
      max(p.limite_seg) filter (where p.kind = 'bano') as bano_limite_seg,
      count(*) filter (where p.kind = 'break' and not p.auto_closed)::int as breaks,
      coalesce(sum(p.seg) filter (where p.kind = 'break' and not p.auto_closed), 0)::int as seg_break,
      max(p.limite_seg) filter (where p.kind = 'break') as break_limite_seg,
      count(*) filter (where p.kind = 'break' and not p.auto_closed and p.limite_seg is not null and p.seg > p.limite_seg)::int as breaks_excedidos,
      coalesce(sum(greatest(0, p.seg - p.limite_seg)) filter (where p.kind = 'break' and not p.auto_closed and p.limite_seg is not null), 0)::int as seg_break_de_mas,
      count(*) filter (where p.auto_closed)::int as auto_cerradas
    from pausas p
    group by p.dia, p.user_id
  )
  select
    su.dia, su.user_id, pr.full_name as nombre,
    su.banos, su.seg_bano, su.bano_limite_seg,
    (su.bano_limite_seg is not null and su.seg_bano > su.bano_limite_seg) as bano_excedido,
    su.breaks, su.seg_break, su.break_limite_seg, su.breaks_excedidos, su.seg_break_de_mas,
    su.auto_cerradas
  from sumas su
  left join public.profiles pr on pr.id = su.user_id
  order by su.dia desc, pr.full_name
  limit least(greatest(_limit, 1), 2000)
  offset greatest(_offset, 0)
$$;
comment on function public.cowork_pausas_resumen(date, date, uuid, uuid, int, int) is
  'Pausas de Cowork por persona y día de Bogotá: veces y segundos de baño (presupuesto diario) y de break (tope por pausa), con el tope vigente de la sesión y si se pasó. Solo pausas cerradas; las auto-cerradas se cuentan aparte y no suman.';
revoke all on function public.cowork_pausas_resumen(date, date, uuid, uuid, int, int) from public, anon;
grant execute on function public.cowork_pausas_resumen(date, date, uuid, uuid, int, int) to authenticated, service_role;

-- Cada pausa al detalle, para GET /cowork/breaks. Solo service_role (la API).
create or replace function public.api_cowork_breaks(
  _from date default null,
  _to date default null,
  _profile_id uuid default null,
  _limit int default 100,
  _offset int default 0
)
returns table (
  id uuid,
  profile_id uuid,
  employee text,
  kind text,
  started_at timestamptz,
  ended_at timestamptz,
  is_open boolean,
  seconds int,
  limit_seconds int,
  exceeded boolean,
  auto_closed boolean,
  session_id uuid,
  session_name text,
  room_id uuid,
  room_name text
)
language sql stable security definer set search_path = public
as $$
  select b.id, b.user_id as profile_id, p.full_name as employee,
         case b.kind when 'bano' then 'bathroom' else b.kind end as kind,
         b.started_at, b.ended_at, (b.ended_at is null) as is_open,
         coalesce(b.duration_seconds, greatest(0, extract(epoch from (now() - b.started_at))::int)) as seconds,
         lim.limite_seg as limit_seconds,
         (lim.limite_seg is not null
          and coalesce(b.duration_seconds, greatest(0, extract(epoch from (now() - b.started_at))::int)) > lim.limite_seg) as exceeded,
         b.auto_closed,
         b.session_id, cs.name as session_name,
         b.room_id, cr.name as room_name
  from public.cowork_breaks b
  left join public.profiles p on p.id = b.user_id
  left join public.cowork_sessions cs on cs.id = b.session_id
  left join public.cowork_rooms cr on cr.id = b.room_id
  left join public.cowork_break_limits l on l.kind = b.kind
  cross join lateral (
    select coalesce(
      nullif(cs.alert_rules->'pausas'->>(case when b.kind = 'break' then 'breakMin' else 'banoMin' end), '')::int,
      l.minutos
    ) * 60 as limite_seg
  ) lim
  where (_from is null or (b.started_at at time zone 'America/Bogota')::date >= _from)
    and (_to is null or (b.started_at at time zone 'America/Bogota')::date <= _to)
    and (_profile_id is null or b.user_id = _profile_id)
  order by b.started_at desc
  limit least(greatest(_limit, 1), 500)
  offset greatest(_offset, 0)
$$;
comment on function public.api_cowork_breaks(date, date, uuid, int, int) is
  'API pública: cada pausa de Cowork (bathroom | break) con duración, tope vigente y si se pasó. Para el baño el tope es el presupuesto del DÍA, no de la pausa: exceeded ahí es orientativo; el veredicto diario está en /cowork/time.';
revoke all on function public.api_cowork_breaks(date, date, uuid, int, int) from public, anon, authenticated;
grant execute on function public.api_cowork_breaks(date, date, uuid, int, int) to service_role;
