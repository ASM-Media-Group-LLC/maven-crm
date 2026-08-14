-- Score de promo v2.1 — DÍA y MES coordinados de punta a punta (pedido de Jhon 13/08):
--
--   DÍA (la barrita de Promos/Calendario) = 70% × mejor promo válida + 30% × la 2ª red.
--     → una sola red perfecta = 70%; para llegar a 100% hay que promocionar BIEN en
--       más de una red ese día. (Antes una red con link ya daba 100%.)
--   MES (leaderboard/reportes) = Frecuencia 40 + CALIDAD 40 + Constancia 20, donde
--     CALIDAD 40 = PROMEDIO DE LAS BARRITAS DIARIAS de los promo-días.
--     → el % diario SUMA literalmente al global del mes. El bonus multi-red separado
--       (10 pts) desaparece: ya vive dentro de cada barrita (la 2ª red del día).
--
-- Mismo calendario de movimiento que Promolog: los buckets por día del RPC son los
-- mismos creador+día del calendario/tabla. La barrita del frontend (promoScore.ts)
-- usa la fórmula idéntica — si se cambia acá, cambiarla allá (espejo documentado).
--
-- Nota de alcance: la CALIDAD del día mira las 4 redes con bot (como la barrita y el
-- calendario). Las REDES OBJETIVO siguen mandando en frecuencia/cobertura/constancia
-- (el "plan" de la creadora define qué días cuentan como leídos y qué es promo-día).

drop function if exists public.promo_creator_period_scores(date, date, uuid);
create function public.promo_creator_period_scores(
  p_from date,
  p_to date,
  p_tenant uuid default null
)
returns table(
  creator_id uuid,
  name text,
  instagram_handle text,
  manager_name text,
  target_networks text[],
  window_days int,
  covered_days int,
  coverage_pct numeric,
  promo_days int,
  freq_pts numeric,
  quality_pts numeric,
  consistency_pts numeric,
  score int,
  is_partial boolean,
  promo_networks text,
  manual_share numeric,
  lift_pct numeric,
  lift_n_promo int,
  lift_n_quiet int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    coalesce(current_setting('request.jwt.claims', true), '') = ''
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
    or exists (select 1 from public.user_roles ur
               where ur.user_id = auth.uid() and ur.role in ('admin','manager','owner'))
  ) then
    raise exception 'forbidden: el score de promo es para management' using errcode = '42501';
  end if;

  return query
  with cb as (
    select c.id,
      coalesce(nullif(c.artistic_name,''), c.name) as cname,
      c.instagram_handle as ig,
      pr.full_name as mgr_name,
      coalesce(
        nullif(c.promo_target_networks, '{}'::text[]),
        nullif(array_remove(array[
          case when nullif(trim(coalesce(c.instagram_handle,'')),'') is not null then 'instagram' end,
          case when nullif(trim(coalesce(c.twitter_handle,'')),'')   is not null then 'x' end,
          case when nullif(trim(coalesce(c.telegram_handle,'')),'')  is not null then 'telegram' end,
          case when nullif(trim(coalesce(c.facebook_handle,'')),'')  is not null then 'facebook' end
        ], null), '{}'::text[]),
        array['instagram']
      ) as targets
    from creators c
    left join profiles pr on pr.id = c.assigned_manager_profile_id
    where c.status = 'active'
  ),
  e as (
    -- promolog_entries.date es timestamp SIN zona (hora de pared Bogotá) → comparar
    -- directo, NUNCA `at time zone`. Escala de calidad = espejo de promoScore.ts.
    select pe.creator_id as cid,
      pe.date::date as d,
      case when lower(coalesce(pe.network,'')) = 'twitter' then 'x' else lower(coalesce(pe.network,'')) end as net,
      coalesce(pe.promoted,'') <> 'pending' as read_ok,
      coalesce(pe.analyzed_by_ai, true) = false as is_manual,
      (lower(coalesce(pe.promoted,'')) in ('true','yes','partial')) as promoted_flag,
      (case
        when lower(coalesce(pe.promoted,'')) not in ('true','yes','partial') then 0
        when coalesce(pe.needs_review, false) = false
             and ( lower(coalesce(pe.platform,'')) in ('fansly','otra')
                or lower(coalesce(pe.buy_link_type,'')) in ('fansly','other') )
             and lower(coalesce(pe.ai_reasoning,'')) !~ 'unlok'
          then 0
        when coalesce(pe.analyzed_by_ai, true) = false then
          case when coalesce(pe.has_buy_link, false) or nullif(pe.buy_link_type,'') is not null then 1.0 else 0.75 end
        when coalesce(pe.has_buy_link, false)
             or lower(coalesce(pe.buy_link_type,'')) in ('onlyfans','unlok','of')
             or lower(coalesce(pe.ai_reasoning,'')) ~ '(of_link|link_agg)'
          then 1.0
        when lower(coalesce(pe.buy_link_type,'')) in ('piclink','linktree')
             or lower(coalesce(pe.platform,'')) in ('piclink','linktree')
          then 0.85
        when lower(coalesce(pe.ai_reasoning,'')) ~ '(onlyfans|of_handle|vision-of)'
          then 0.6
        else 0.3
      end) * (case when lower(coalesce(pe.promoted,'')) = 'partial' then 0.5 else 1 end) as q
    from promolog_entries pe
    where (p_tenant is null or pe.tenant_id = p_tenant)
      and pe.date >= p_from::timestamp
      and pe.date <  (p_to + 1)::timestamp
      and lower(coalesce(pe.network,'')) in ('instagram','x','twitter','telegram','facebook')
  ),
  e2 as (select e.*, (e.promoted_flag and e.q > 0) as is_promo from e),
  -- CALIDAD DEL DÍA (misma fórmula que la barrita, sobre las 4 redes con bot):
  -- mejor q por red → día = 0.7×mejor + 0.3×segunda red.
  net_day as (
    select e2.cid, e2.d, e2.net, max(e2.q) as nq
    from e2 where e2.is_promo
    group by e2.cid, e2.d, e2.net
  ),
  day_quality as (
    select nd.cid, nd.d,
      0.7 * max(nd.nq) + 0.3 * coalesce((array_agg(nd.nq order by nd.nq desc))[2], 0) as day_q
    from net_day nd
    group by nd.cid, nd.d
  ),
  -- Cobertura / promo-día / manual sobre las REDES OBJETIVO (el plan de la creadora).
  day_target as (
    select cb.id as cid, e2.d,
      bool_or(e2.read_ok) as covered,
      bool_or(e2.is_promo) as promoted,
      bool_or(e2.is_promo) and not bool_or(e2.is_promo and not e2.is_manual) as manual_only
    from cb
    join e2 on e2.cid = cb.id and e2.net = any(cb.targets)
    group by cb.id, e2.d
  ),
  gaps as (
    select runs.cid, max(runs.run_len) as max_gap
    from (
      select marked.cid, marked.grp, count(*) as run_len
      from (
        select dt2.cid, dt2.d, dt2.promoted,
          sum(case when dt2.promoted then 1 else 0 end) over (partition by dt2.cid order by dt2.d) as grp
        from day_target dt2
        where dt2.covered
      ) marked
      where not marked.promoted
      group by marked.cid, marked.grp
    ) runs
    group by runs.cid
  ),
  nets as (
    select e2.cid, string_agg(distinct e2.net, ', ' order by e2.net) as promo_nets
    from e2 where e2.is_promo group by e2.cid
  ),
  agg as (
    select cb.id as cid, cb.cname, cb.ig, cb.mgr_name, cb.targets,
      (p_to - p_from + 1) as wdays,
      count(*) filter (where dt.covered)::int as cov_days,
      count(*) filter (where dt.promoted)::int as pro_days,
      count(*) filter (where dt.manual_only)::int as manual_days,
      avg(dq.day_q) filter (where dt.promoted) as avg_day_q
    from cb
    left join day_target dt on dt.cid = cb.id
    left join day_quality dq on dq.cid = dt.cid and dq.d = dt.d
    group by cb.id, cb.cname, cb.ig, cb.mgr_name, cb.targets
  ),
  income as (
    select dt.cid,
      avg(cde.total_gross) filter (where dt.promoted) as inc_after_promo,
      avg(cde.total_gross) filter (where not dt.promoted) as inc_after_quiet,
      count(*) filter (where dt.promoted)::int as n_promo,
      count(*) filter (where not dt.promoted)::int as n_quiet
    from day_target dt
    join creator_daily_earnings cde on cde.creator_id = dt.cid and cde.date = dt.d + 1
    where dt.covered and dt.d + 1 <= current_date - 2
    group by dt.cid
  )
  select
    a.cid, a.cname, a.ig, a.mgr_name, a.targets,
    a.wdays,
    a.cov_days,
    round(100.0 * a.cov_days / nullif(a.wdays, 0)) as coverage_pct,
    a.pro_days,
    round(40.0 * a.pro_days / nullif(a.cov_days, 0), 1) as freq_pts,
    -- CALIDAD 40 = promedio de las barritas diarias (los promo-días).
    round(40.0 * coalesce(a.avg_day_q, 0), 1) as quality_pts,
    case
      when a.pro_days = 0 then 0
      else round(20.0 * greatest(0, 1 - greatest(coalesce(g.max_gap, 0) - 1, 0) / 6.0), 1)
    end as consistency_pts,
    least(100, round(
      coalesce(40.0 * a.pro_days / nullif(a.cov_days, 0), 0)
      + 40.0 * coalesce(a.avg_day_q, 0)
      + case when a.pro_days = 0 then 0
             else 20.0 * greatest(0, 1 - greatest(coalesce(g.max_gap, 0) - 1, 0) / 6.0) end
    ))::int as score,
    (a.cov_days < 0.6 * a.wdays) as is_partial,
    n.promo_nets as promo_networks,
    case when a.pro_days > 0 then round(100.0 * a.manual_days / a.pro_days) end as manual_share,
    case
      when coalesce(i.n_promo, 0) >= 5 and coalesce(i.n_quiet, 0) >= 5 and i.inc_after_quiet > 0
      then round(100.0 * (i.inc_after_promo - i.inc_after_quiet) / i.inc_after_quiet)
      else null
    end as lift_pct,
    coalesce(i.n_promo, 0) as lift_n_promo,
    coalesce(i.n_quiet, 0) as lift_n_quiet
  from agg a
  left join gaps g on g.cid = a.cid
  left join nets n on n.cid = a.cid
  left join income i on i.cid = a.cid
  order by score desc nulls last, a.cname;
end;
$$;

comment on function public.promo_creator_period_scores(date, date, uuid) is
  'Score de promo v2.1 (0-100): Frecuencia 40 (promo-días válidos/días leídos en redes objetivo) + Calidad 40 (PROMEDIO de las barritas diarias: 0.7×mejor promo + 0.3×2ª red — 100% del día exige promo buena en 2+ redes) + Constancia 20 (racha sin promo). El día y el mes usan la MISMA fórmula (espejo en promoScore.ts). manual_share/lift_pct = señales aparte. Gate: management/service_role. is_partial nunca rankea sobre cobertura completa.';

revoke all on function public.promo_creator_period_scores(date, date, uuid) from public, anon;
grant execute on function public.promo_creator_period_scores(date, date, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
