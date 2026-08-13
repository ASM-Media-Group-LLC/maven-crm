-- Sistema de puntuación de promo v2 — "score de periodo" (reemplaza el day-score v1
-- de pesos fijos IG 60% / X 13,3% / TG 13,3% / FB 13,3% como sistema de RANKING).
--
-- POR QUÉ (defectos medidos del v1, semana del 2026-07-28):
--   · El 60% fijo de IG capaba estructuralmente a quien no vive en IG: Martina Smith
--     (X 15d + TG 11d con link directo a OF) tenía tope matemático ~27%. 5 de las 7
--     "revisar calidad" de Carolina estaban en esa situación.
--   · "IG no leído" (pending) puntuaba igual que "IG sin promo" → el score caía por
--     cobertura del scan, no por comportamiento (mismo bug conceptual que low_promo #956).
--   · Score de día suelto: no distinguía 5 promos repartidas de 5 promos el lunes.
--   · Calidad por substrings frágiles del ai_reasoning.
--
-- DISEÑO v2 (aprobado por Jhon 2026-07-30; endurecido con revisión adversarial 2026-08-13):
--   · REDES OBJETIVO por creadora (creators.promo_target_networks; null = auto por
--     handles registrados). El score mide cumplimiento DEL PLAN DE ESA creadora.
--   · Score de PERIODO 0-100 = Frecuencia 40 + Calidad 30 + Consistencia 20 + Multi-red 10.
--   · Un "promo-día" exige CALIDAD > 0: promocionar solo Fansly/no-gestionada NO cobra
--     frecuencia ni consistencia (hallazgo adversarial — antes sí contaba).
--   · Días NO leídos se EXCLUYEN (denominador = días leídos); cobertura <60% → is_partial.
--   · Multi-red = promo en 2+ redes distintas en la ventana (5 pts la 2ª, 10 con 3+).
--     (La definición anterior "fuera del plan" era inalcanzable con targets automáticos.)
--   · Legacy promoted='yes' cuenta como promo; 'partial' como promo con calidad ×0.5
--     (paridad con el v1 — degradarlos a "sin promo" rompía la racha injustamente).
--   · manual_share = % de promo-días sostenidos SOLO por entries manuales → visible,
--     porque una manager podría inflar el score cargando manuales (transparencia > veto).
--   · IMPACTO ($) como señal SEPARADA: lift_pct = ingreso del día SIGUIENTE a un día con
--     promo vs sin promo (BLU liquidado a -2d), mínimo 5 días por lado, con lift_n_* para
--     que el consumidor muestre el tamaño de la muestra.
--   · Gate de rol: solo management (admin/manager/owner), service_role o sesión directa
--     de DB — el ranking completo con lift no es para cualquier rol logueado.
--
-- FUENTE ÚNICA DE VERDAD: este RPC. Lo consumen la UI (leaderboard de Promolog) y
-- promolog-highlights (7pm/sábado). El day-score v1 (promoScore.ts) queda SOLO como
-- visual de detalle del día, ya no rankea. REGLA de consumo: las 'is_partial' NUNCA
-- deben rankear por encima de las de cobertura completa (poca evidencia infla).

-- ── Redes objetivo por creadora ───────────────────────────────────────────────
alter table public.creators add column if not exists promo_target_networks text[];

comment on column public.creators.promo_target_networks is
  'Redes donde SE ESPERA que esta creadora promocione (plan de la manager/Lorena). Subconjunto de {instagram,x,telegram,facebook}. NULL = auto: las redes con handle registrado (fallback instagram). El score v2 mide cumplimiento contra ESTE plan.';

-- Un plan explícito no puede ser vacío ni traer redes inválidas (un '{}' explícito
-- dejaría a la creadora sin días cubiertos y con score 0 silencioso).
alter table public.creators drop constraint if exists promo_target_networks_valid;
alter table public.creators add constraint promo_target_networks_valid check (
  promo_target_networks is null
  or (cardinality(promo_target_networks) > 0
      and promo_target_networks <@ array['instagram','x','telegram','facebook'])
);

-- ── Motor del score de periodo ────────────────────────────────────────────────
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
  diversification_pts numeric,
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
  -- Gate: management, el micro (service_role) o una sesión directa de DB (sin JWT,
  -- p.ej. MCP/psql — solo un DBA llega ahí). El ranking completo + lift no es para
  -- cualquier rol logueado (chatters/closers no lo necesitan).
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
    -- Activas + su plan de redes (explícito > auto por handles > fallback IG).
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
    -- Entries del periodo con red canónica + calidad v2 por entry.
    -- promolog_entries.date es timestamp SIN zona (hora de pared Bogotá) → comparar
    -- directo contra las fechas, NUNCA `at time zone` (corre la noche al día siguiente).
    select pe.creator_id as cid,
      pe.date::date as d,
      case when lower(coalesce(pe.network,'')) = 'twitter' then 'x' else lower(coalesce(pe.network,'')) end as net,
      coalesce(pe.promoted,'') <> 'pending' as read_ok,
      coalesce(pe.analyzed_by_ai, true) = false as is_manual,
      -- promo-día solo si la calidad es > 0 (una promo SOLO a Fansly/no-gestionada no
      -- cobra frecuencia). 'yes' legacy = promo; 'partial' = promo con q×0.5 (como v1).
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
    -- p_tenant null = sin filtro (la DB es single-tenant de facto: creators ni siquiera
    -- tiene tenant_id). Las edges lo pasan explícito; el frontend llama sin él.
    where (p_tenant is null or pe.tenant_id = p_tenant)
      and pe.date >= p_from::timestamp
      and pe.date <  (p_to + 1)::timestamp
      and lower(coalesce(pe.network,'')) in ('instagram','x','twitter','telegram','facebook')
  ),
  e2 as (select e.*, (e.promoted_flag and e.q > 0) as is_promo from e),
  -- Día × creadora sobre las REDES OBJETIVO: ¿se leyó?, ¿hubo promo válida?, mejor calidad.
  day_target as (
    select cb.id as cid, e2.d,
      bool_or(e2.read_ok) as covered,
      bool_or(e2.is_promo) as promoted,
      max(e2.q) filter (where e2.is_promo) as day_q,
      -- promo-día "solo manual" = ninguna entry de bot lo sostiene (transparencia).
      bool_or(e2.is_promo) and not bool_or(e2.is_promo and not e2.is_manual) as manual_only
    from cb
    join e2 on e2.cid = cb.id and e2.net = any(cb.targets)
    group by cb.id, e2.d
  ),
  -- Racha máxima de días LEÍDOS consecutivos sin promo (para consistencia).
  gaps as (
    select dt.cid, max(run_len) as max_gap
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
    join day_target dt on dt.cid = runs.cid
    group by dt.cid
  ),
  -- Multi-red: en cuántas redes DISTINTAS hubo promo válida en la ventana (todas las
  -- redes, no solo el plan). 2 redes = 5 pts, 3+ = 10. Alcanzable por cualquiera —
  -- la definición anterior ("fuera del plan") era inalcanzable con targets automáticos.
  nets as (
    select e2.cid,
      count(distinct e2.net) as n_nets,
      string_agg(distinct e2.net, ', ' order by e2.net) as promo_nets
    from e2
    where e2.is_promo
    group by e2.cid
  ),
  agg as (
    select cb.id as cid, cb.cname, cb.ig, cb.mgr_name, cb.targets,
      (p_to - p_from + 1) as wdays,
      count(*) filter (where dt.covered)::int as cov_days,
      count(*) filter (where dt.promoted)::int as pro_days,
      count(*) filter (where dt.manual_only)::int as manual_days,
      avg(dt.day_q) filter (where dt.promoted) as avg_q
    from cb
    left join day_target dt on dt.cid = cb.id
    group by cb.id, cb.cname, cb.ig, cb.mgr_name, cb.targets
  ),
  -- Lift: ingreso del día SIGUIENTE a un día con promo vs a un día leído sin promo.
  -- Solo días LIQUIDADOS de BLU (D+1 <= hoy-2; hoy/ayer llegan parciales, ver #920).
  -- INNER join a propósito: BLU no escribe filas de $0, así que un D+1 sin fila no es
  -- distinguible de "sin sync" — se excluye de AMBOS lados y los n_* miden la muestra real.
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
    round(30.0 * coalesce(a.avg_q, 0), 1) as quality_pts,
    case
      when a.pro_days = 0 then 0
      -- max_gap null = todos los días leídos tuvieron promo → consistencia perfecta.
      -- 1 día suelto sin promo no castiga; 7+ días seguidos sin promo = 0 puntos.
      else round(20.0 * greatest(0, 1 - greatest(coalesce(g.max_gap, 0) - 1, 0) / 6.0), 1)
    end as consistency_pts,
    least(10, 5 * greatest(coalesce(n.n_nets, 0) - 1, 0))::numeric as diversification_pts,
    least(100, round(
      coalesce(40.0 * a.pro_days / nullif(a.cov_days, 0), 0)
      + 30.0 * coalesce(a.avg_q, 0)
      + case when a.pro_days = 0 then 0
             else 20.0 * greatest(0, 1 - greatest(coalesce(g.max_gap, 0) - 1, 0) / 6.0) end
      + least(10, 5 * greatest(coalesce(n.n_nets, 0) - 1, 0))
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
  'Score de promo v2 (0-100) por creadora en una ventana: Frecuencia 40 (promo-días VÁLIDOS/días-LEÍDOS en sus redes objetivo) + Calidad 30 (CTA estructurado) + Consistencia 20 (racha máxima sin promo) + Multi-red 10 (promo en 2+ redes). Promo-día exige calidad>0 (Fansly no cobra). manual_share = % de promo-días solo-manuales. lift_pct (±lift_n_*) = impacto en ingreso BLU, señal separada. Gate: management/service_role. Consumo: las is_partial nunca por encima de cobertura completa.';

revoke all on function public.promo_creator_period_scores(date, date, uuid) from public, anon;
grant execute on function public.promo_creator_period_scores(date, date, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
