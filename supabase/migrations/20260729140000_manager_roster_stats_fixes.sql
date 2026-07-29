-- Correcciones sobre 20260729120000 (salieron de la verificación adversarial del PR #978).
--
-- [HIGH] p_date default current_date se evalúa en UTC (TimeZone=UTC en prod, ningún rol
--   lo sobreescribe) → entre las 19:00 y 23:59 de Bogotá el default apuntaba a MAÑANA y
--   promoted/covered/contacted colapsaban a 0: el bot habría reportado "Caro 0 de 29 = 0%"
--   como dato duro, justo en la franja en que sigue contestando en el grupo. Ahora el día
--   se resuelve SIEMPRE en Bogotá (igual que get_promo_day_breakdown) y se devuelve
--   effective_date para que el bot no pueda equivocarse sobre qué día reporta.
--
-- [HIGH] El día EN CURSO está incompleto (la mayor parte de la promo se detecta por la
--   tarde) → is_partial_day avisa que ese % es un piso y no sirve para comparar managers.
--
-- [MEDIUM] contacted_pct se calculaba sobre total_active, pero las creadoras sin teléfono
--   normalizable NO PUEDEN contar como contactadas nunca (y la hermana
--   get_manager_silent_creators las excluye del roster) → el % castigaba a la manager y los
--   números no reconciliaban entre tools. Ahora contacted_pct va sobre reachable_count.
--
-- [MEDIUM] Promolog no puede leer a una creadora sin ningún handle (hoy 2 activas, ambas de
--   Carolina) → su techo de promo es < 100%. Se expone scannable_count para poder matizarlo.
--
-- [LOW] El guard del fallback de 8 dígitos solo medía ambigüedad del lado del CONTACTO: si
--   dos creadoras del roster comparten los últimos 8 dígitos, escribirle a UNA marcaba a las
--   DOS como contactadas. Ahora se exige unicidad TAMBIÉN dentro del roster.

drop function if exists public.get_manager_roster_stats(uuid, date);
create function public.get_manager_roster_stats(
  p_tenant uuid,
  p_date date default null
)
returns table(
  manager_profile_id uuid,
  manager_name text,
  kash_types text,
  effective_date date,
  is_partial_day boolean,
  total_active int,
  scannable_count int,
  reachable_count int,
  covered_count int,
  promoted_count int,
  promoted_pct numeric,
  contacted_count int,
  contacted_pct numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    -- El día SIEMPRE en Bogotá: current_date en este server es UTC y a partir de las
    -- 19:00 locales daría el día siguiente.
    select coalesce(p_date, (now() at time zone 'America/Bogota')::date) as day,
           (now() at time zone 'America/Bogota')::date as today_bog
  ),
  roster as (
    select c.id,
           c.assigned_manager_profile_id as mgr,
           cb.kash_type,
           (coalesce(nullif(trim(c.instagram_handle),''), nullif(trim(c.telegram_handle),'')) is not null) as scannable,
           right(public.canonical_phone(coalesce(c.phone_e164, c.whatsapp_number, c.phone)),10) as k10,
           right(regexp_replace(coalesce(c.phone_e164, c.whatsapp_number, c.phone, ''),'\D','','g'),8) as k8
    from public.creators c
    left join public.creator_business cb on cb.creator_id = c.id
    where c.status = 'active'
  ),
  -- promolog_entries.date es timestamp SIN zona (hora de pared de Bogotá) → se compara
  -- directo contra el día. NO usar `at time zone` acá: sobre un timestamp naive corre las
  -- promos de la noche al día siguiente y subcuenta el día.
  promo as (
    select e.creator_id,
      bool_or(e.promoted in ('true','yes','partial')) as promoted,
      bool_or(coalesce(e.promoted,'') <> 'pending') as covered
    from public.promolog_entries e cross join d
    where e.tenant_id = p_tenant
      and e.date >= d.day::timestamp
      and e.date <  (d.day + 1)::timestamp
    group by 1
  ),
  mgr_lines as (
    select id from public.wa_channels
    where tenant_id = p_tenant and department = 'manager' and active
  ),
  contact_out as (
    select right(public.canonical_phone(ct.phone_e164),10) as k10,
           right(regexp_replace(coalesce(ct.phone_e164,''),'\D','','g'),8) as k8
    from public.wa_conversations conv
    join public.wa_contacts ct on ct.id = conv.contact_id
    join public.wa_conversation_messages msg
      on msg.conversation_id = conv.id and msg.deleted_at is null
         and msg.direction = 'out' and coalesce(msg.status,'') <> 'failed'
    cross join d
    where conv.channel_id in (select id from mgr_lines)
      and msg.sent_at >= (d.day::timestamp at time zone 'America/Bogota')
      and msg.sent_at <  ((d.day + 1)::timestamp at time zone 'America/Bogota')
    group by 1, 2
  ),
  by_canon as (select k10 from contact_out where length(k10) = 10 group by k10),
  by_k8 as (select k8, count(distinct k10) as n_canon from contact_out where length(k8) = 8 group by k8),
  -- Unicidad del k8 DENTRO del roster: sin esto, escribirle a una creadora marcaba como
  -- contactada a cualquier otra que comparta los últimos 8 dígitos.
  roster_k8 as (select k8, count(*) as n_roster from roster where length(k8) = 8 group by k8),
  resolved as (
    select r.mgr, r.kash_type, r.scannable,
      (length(r.k10) = 10 or length(r.k8) = 8) as reachable,
      coalesce(p.promoted, false) as promoted,
      coalesce(p.covered, false) as covered,
      (
        exists (select 1 from by_canon bc where length(r.k10) = 10 and bc.k10 = r.k10)
        or exists (
          select 1 from by_k8 bk join roster_k8 rk on rk.k8 = bk.k8
          where length(r.k8) = 8 and bk.k8 = r.k8 and bk.n_canon = 1 and rk.n_roster = 1
        )
      ) as contacted
    from roster r
    left join promo p on p.creator_id = r.id
  )
  select r.mgr,
         m.full_name,
         string_agg(distinct r.kash_type, '/' order by r.kash_type),
         (select day from d),
         (select day = today_bog from d),
         count(*)::int,
         count(*) filter (where r.scannable)::int,
         count(*) filter (where r.reachable)::int,
         count(*) filter (where r.covered)::int,
         count(*) filter (where r.promoted)::int,
         round(100.0 * count(*) filter (where r.promoted) / nullif(count(*), 0)),
         count(*) filter (where r.contacted)::int,
         -- contacted_pct sobre las ALCANZABLES: las sin teléfono usable no pueden contar.
         round(100.0 * count(*) filter (where r.contacted) / nullif(count(*) filter (where r.reachable), 0))
  from resolved r
  left join public.profiles m on m.id = r.mgr
  group by r.mgr, m.full_name
  order by m.full_name nulls last;
$$;

comment on function public.get_manager_roster_stats(uuid, date) is
  'Roster por manager + promo/contacto del día y sus %. El día se resuelve en Bogotá (effective_date); is_partial_day=true ⇒ el % es un PISO. promoted_pct va sobre total_active, contacted_pct sobre reachable_count.';

revoke all on function public.get_manager_roster_stats(uuid, date) from public, anon;
grant execute on function public.get_manager_roster_stats(uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_manager_growth_feed: el aviso de red ahora mira SI PROMOCIONA en IG,
-- no si IG "se pudo leer"
-- ---------------------------------------------------------------------------
-- [HIGH] ig_has_data = bool_or(promoted<>'pending') respondía "IG fue legible", no "IG es
--   su canal": con UNA entry legible en el mes volvía a habilitar el veredicto basado en
--   historias de IG — el bug que este trabajo venía a arreglar. Ahora se exponen
--   ig_promo_days / ig_read_days y el aviso se emite cuando IG NO es su canal de promo
--   (0 días de promo en IG, o menos del 30% de sus días de promo).
-- [HIGH] Con promo_networks NULL el texto afirmaba "su promo es en otras redes → revisá la
--   calidad EN ESAS REDES" sobre una creadora con CERO promo detectada. Ahora ese caso
--   tiene su propio texto y no inventa redes.
-- [MEDIUM] Con covered_days < 5 el cuadrante cae en 'calidad' por construcción (low_promo
--   exige >=5) y decía "Promociona bien (1/2 días leídos)". Ahora dice que los datos no
--   alcanzan para juzgar. Se mantiene el VALOR 'calidad' del cuadrante a propósito: los
--   consumidores (promolog-manager-tick, alvaro_pulse) filtran por esos valores y un
--   'sin_datos' nuevo haría que descarten la fila en silencio.
drop function if exists public.get_manager_growth_feed(uuid, numeric, numeric);
create function public.get_manager_growth_feed(
  p_tenant uuid,
  p_low_promo_rate numeric default 0.40,
  p_income_drop_pct numeric default 15
)
returns table(
  creator_id uuid, name text, instagram_handle text, category text,
  manager_profile_id uuid, manager_name text, manager_phone text,
  promo_days integer, covered_days integer, mtd_day integer,
  income_mtd numeric, income_prev_mtd numeric, income_trend_pct numeric,
  quadrant text, priority integer, diagnosis text,
  promo_networks text, ig_has_data boolean,
  ig_promo_days integer, ig_read_days integer
)
language sql
stable
security definer
set search_path = public
as $function$
  with b0 as (
    select
      date_trunc('month', current_date)::date as this_start,
      extract(day from current_date)::int as mtd_day,
      greatest(date_trunc('month', current_date)::date, current_date - 2)::date as inc_cutoff,
      (date_trunc('month', current_date) - interval '1 month')::date as prev_start
  ),
  bounds as (
    select this_start, mtd_day, inc_cutoff,
      extract(day from inc_cutoff)::int as income_day,
      prev_start,
      least(prev_start + (inc_cutoff - this_start), this_start - 1) as prev_cutoff
    from b0
  ),
  active_models as (
    select c.id, coalesce(nullif(c.artistic_name,''), c.name) as name, c.instagram_handle,
           c.category, c.assigned_manager_profile_id as mgr
    from creators c
    where c.status = 'active' and c.assigned_manager_profile_id is not null
  ),
  promo as (
    select e.creator_id,
      count(distinct e.date::date) filter (where e.promoted in ('true','yes','partial')) as promo_days,
      count(distinct e.date::date) filter (where coalesce(e.promoted,'') <> 'pending') as covered_days
    from promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.date >= b.this_start::timestamptz
    group by e.creator_id
  ),
  net_days as (
    select e.creator_id, e.network,
      count(distinct e.date::date) filter (where e.promoted in ('true','yes','partial')) as d
    from promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.date >= b.this_start::timestamptz
    group by e.creator_id, e.network
  ),
  nets as (
    select creator_id,
      string_agg(network || ':' || d || 'd', ', ' order by d desc, network) as promo_networks
    from net_days where d > 0 group by creator_id
  ),
  ig as (
    select e.creator_id,
      count(distinct e.date::date) filter (where e.promoted in ('true','yes','partial')) as ig_promo_days,
      count(distinct e.date::date) filter (where coalesce(e.promoted,'') <> 'pending') as ig_read_days
    from promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.date >= b.this_start::timestamptz and e.network = 'instagram'
    group by e.creator_id
  ),
  inc as (
    select e.creator_id,
      coalesce(sum(e.total_gross) filter (where e.date >= b.this_start and e.date <= b.inc_cutoff), 0) as income_mtd,
      coalesce(sum(e.total_gross) filter (where e.date >= b.prev_start and e.date <= b.prev_cutoff), 0) as income_prev_mtd
    from creator_daily_earnings e cross join bounds b
    where e.date >= b.prev_start
    group by e.creator_id
  ),
  scored as (
    select a.id, a.name, a.instagram_handle, a.category, a.mgr,
      m.full_name as manager_name, m.phone_e164 as manager_phone,
      coalesce(p.promo_days,0) as promo_days, coalesce(p.covered_days,0) as covered_days,
      b.mtd_day, b.income_day,
      coalesce(i.income_mtd,0) as income_mtd, coalesce(i.income_prev_mtd,0) as income_prev_mtd,
      n.promo_networks,
      coalesce(g.ig_promo_days,0) as ig_promo_days,
      coalesce(g.ig_read_days,0) as ig_read_days,
      -- IG es su canal si promocionó ahí y representa >= 30% de sus días de promo.
      (coalesce(g.ig_promo_days,0) > 0
        and coalesce(g.ig_promo_days,0) * 10 >= coalesce(p.promo_days,0) * 3) as ig_is_channel,
      (coalesce(p.covered_days,0) >= 5 and coalesce(p.promo_days,0) < p_low_promo_rate * coalesce(p.covered_days,0)) as low_promo,
      (coalesce(i.income_prev_mtd,0) > 0 and coalesce(i.income_mtd,0) < coalesce(i.income_prev_mtd,0) * (1 - p_income_drop_pct/100.0)) as income_down,
      case when coalesce(i.income_prev_mtd,0) > 0
           then round(((coalesce(i.income_mtd,0) - i.income_prev_mtd) / i.income_prev_mtd * 100)::numeric)
           else null end as income_trend_pct
    from active_models a
    cross join bounds b
    left join profiles m on m.id = a.mgr
    left join promo p on p.creator_id = a.id
    left join nets n on n.creator_id = a.id
    left join ig g on g.creator_id = a.id
    left join inc i on i.creator_id = a.id
  )
  select s.id, s.name, s.instagram_handle, s.category, s.mgr, s.manager_name, s.manager_phone,
    s.promo_days, s.covered_days, s.mtd_day, s.income_mtd, s.income_prev_mtd, s.income_trend_pct,
    case when s.low_promo and s.income_down then 'critico'
         when (not s.low_promo) and s.income_down then 'calidad'
         when s.low_promo and (not s.income_down) then 'riesgo'
         else 'sana' end as quadrant,
    case when s.low_promo and s.income_down then 1
         when (not s.low_promo) and s.income_down then 2
         when s.low_promo and (not s.income_down) then 3
         else 4 end as priority,
    case
      when s.low_promo and s.income_down then
        format('Promociona %s de %s días leídos este mes y sus ingresos caen %s%% (al día %s: $%s vs $%s el mes pasado) → empujar promo YA%s',
               s.promo_days, s.covered_days, abs(s.income_trend_pct), s.income_day, round(s.income_mtd), round(s.income_prev_mtd),
               case when s.promo_networks is null then '' else format(' [promo en %s]', s.promo_networks) end)
      when (not s.low_promo) and s.income_down then
        case
          when s.covered_days < 5 then
            format('⚠️ DATOS INSUFICIENTES este mes (solo %s días leídos): no alcanza para juzgar promo ni calidad. Su ingreso cae %s%% (al día %s) → revisar cobertura del scan/handles antes de sacar conclusiones%s',
                   s.covered_days, abs(s.income_trend_pct), s.income_day,
                   case when s.promo_networks is null then '' else format(' [promo en %s]', s.promo_networks) end)
          when s.promo_networks is null then
            format('⚠️ SIN promo registrada en NINGUNA red este mes (%s días leídos) y su ingreso cae %s%% (al día %s) → NO es un problema de calidad: verificá si realmente está promocionando y que el scan la esté cubriendo',
                   s.covered_days, abs(s.income_trend_pct), s.income_day)
          when s.ig_is_channel then
            format('Promociona bien (%s/%s días leídos) pero sus ingresos caen %s%% (al día %s vs mismo tramo del mes pasado) → revisar CALIDAD/estrategia [promo en %s]',
                   s.promo_days, s.covered_days, abs(s.income_trend_pct), s.income_day, s.promo_networks)
          else
            format('Promociona bien (%s/%s días leídos) pero sus ingresos caen %s%% (al día %s vs mismo tramo del mes pasado) → revisar CALIDAD/estrategia ⚠️ INSTAGRAM NO ES SU CANAL (IG: %s días de promo / %s leídos) — su promo es en %s: NO atribuyas la caída a las historias de IG, revisá la calidad EN ESAS REDES',
                   s.promo_days, s.covered_days, abs(s.income_trend_pct), s.income_day,
                   s.ig_promo_days, s.ig_read_days, s.promo_networks)
        end
      when s.low_promo and (not s.income_down) then
        format('Promociona poco (%s/%s días leídos este mes) — ingreso aún ok, pero riesgo a futuro → sumar promo/otra red%s',
               s.promo_days, s.covered_days,
               case when s.promo_networks is null then '' else format(' [promo en %s]', s.promo_networks) end)
      else 'Sana' end as diagnosis,
    s.promo_networks,
    (s.ig_read_days > 0) as ig_has_data,
    s.ig_promo_days,
    s.ig_read_days
  from scored s
  where not (s.low_promo = false and s.income_down = false)
  order by priority, s.income_mtd desc;
$function$;

comment on function public.get_manager_growth_feed(uuid, numeric, numeric) is
  'Radar promo×ingreso por creadora en alerta. ig_promo_days/ig_read_days/promo_networks: si IG no es su canal de promo, el veredicto de calidad NO debe atribuirse a historias de IG.';

revoke all on function public.get_manager_growth_feed(uuid, numeric, numeric) from public, anon;
grant execute on function public.get_manager_growth_feed(uuid, numeric, numeric) to authenticated, service_role;
