-- Dos huecos que salieron de la revisión del grupo Managers/Promolog (29/07):
--
-- 1) EL BOT NO PODÍA CALCULAR "% del total de creadoras de cada manager" y se lo pedía
--    a los humanos ("necesito que me confirmen cuántas creadoras tiene cada una").
--    Causa: get_manager_growth_feed filtra `where not (low_promo=false and income_down=false)`
--    → SOLO devuelve creadoras EN ALERTA, nunca el tamaño del roster. El dato siempre
--    existió (creators.assigned_manager_profile_id + creator_business.kash_type:
--    Plus=Carolina / Massive=Fabiana). Fix: RPC nueva get_manager_roster_stats que
--    devuelve el DENOMINADOR + promocionaron/contactaron del día y sus %.
--
-- 2) EL VEREDICTO DE "CALIDAD" CULPABA A LAS HISTORIAS DE IG SIN SABER EN QUÉ RED
--    PROMOCIONA la creadora. Caso real (lo reportó Carolina): Martina Smith
--    (msmartinasmith1) en julio tiene Instagram 100% 'pending' (32 entries, 0 dato
--    utilizable) y su promo real es X (65 promos / 15 días) + Telegram (14 / 11 días).
--    El cuadrante 'calidad' le decía "revisar CALIDAD" y el bot lo traducía a "revisá
--    formato/oferta de las historias de IG" — una vara que para ella NO EXISTE.
--    Fix: el feed ahora expone promo_networks + ig_has_data y el diagnóstico avisa
--    explícitamente cuando NO hay dato de IG, para no atribuir el problema a IG.

-- ---------------------------------------------------------------------------
-- 1) get_manager_roster_stats — el denominador que le faltaba al bot
-- ---------------------------------------------------------------------------
-- Agrupa por manager asignada (fuente canónica). Incluye una fila con
-- manager_name NULL para las activas SIN manager, así el total es honesto y esas
-- creadoras no quedan invisibles (que era el bug viejo de los reportes).
-- covered_count = creadoras con al menos una lectura NO-pending ese día (Promolog
-- pudo leerlas). Sirve para matizar: "promocionaron 12 de 29, pero solo leímos 20".
create or replace function public.get_manager_roster_stats(
  p_tenant uuid,
  p_date date default current_date
)
returns table(
  manager_profile_id uuid,
  manager_name text,
  kash_types text,
  total_active int,
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
  with roster as (
    select c.id,
           c.assigned_manager_profile_id as mgr,
           cb.kash_type,
           right(public.canonical_phone(coalesce(c.phone_e164, c.whatsapp_number, c.phone)),10) as k10,
           right(regexp_replace(coalesce(c.phone_e164, c.whatsapp_number, c.phone, ''),'\D','','g'),8) as k8
    from public.creators c
    left join public.creator_business cb on cb.creator_id = c.id
    where c.status = 'active'
  ),
  -- promolog_entries.date es timestamp SIN zona (hora local) → se compara directo
  -- contra p_date. NO usar `at time zone` acá: sobre un timestamp naive corre las
  -- promos de la noche al día siguiente y subcuenta el día.
  promo as (
    select e.creator_id,
      bool_or(e.promoted in ('true','yes','partial')) as promoted,
      bool_or(coalesce(e.promoted,'') <> 'pending') as covered
    from public.promolog_entries e
    where e.tenant_id = p_tenant
      and e.date >= p_date::timestamp
      and e.date <  (p_date + 1)::timestamp
    group by 1
  ),
  -- Contacto = saliente desde una LÍNEA DE MANAGER en el día (mismo criterio que
  -- get_manager_silent_creators, con el match canónico de teléfono de #967).
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
    where conv.channel_id in (select id from mgr_lines)
      and msg.sent_at >= (p_date::timestamp at time zone 'America/Bogota')
      and msg.sent_at <  ((p_date + 1)::timestamp at time zone 'America/Bogota')
    group by 1, 2
  ),
  by_canon as (select k10 from contact_out where length(k10) = 10 group by k10),
  by_k8 as (select k8, count(distinct k10) as n_canon from contact_out where length(k8) = 8 group by k8),
  resolved as (
    select r.mgr, r.kash_type,
      coalesce(p.promoted, false) as promoted,
      coalesce(p.covered, false) as covered,
      (
        exists (select 1 from by_canon bc where length(r.k10) = 10 and bc.k10 = r.k10)
        or exists (select 1 from by_k8 bk where length(r.k8) = 8 and bk.k8 = r.k8 and bk.n_canon = 1)
      ) as contacted
    from roster r
    left join promo p on p.creator_id = r.id
  )
  select r.mgr,
         m.full_name,
         string_agg(distinct r.kash_type, '/' order by r.kash_type),
         count(*)::int,
         count(*) filter (where r.covered)::int,
         count(*) filter (where r.promoted)::int,
         round(100.0 * count(*) filter (where r.promoted) / nullif(count(*), 0)),
         count(*) filter (where r.contacted)::int,
         round(100.0 * count(*) filter (where r.contacted) / nullif(count(*), 0))
  from resolved r
  left join public.profiles m on m.id = r.mgr
  group by r.mgr, m.full_name
  order by m.full_name nulls last;
$$;

comment on function public.get_manager_roster_stats(uuid, date) is
  'Tamaño del roster por manager + promocionaron/contactaron del día y sus %. Es el DENOMINADOR que get_manager_growth_feed no da (ese solo devuelve las creadoras en alerta).';

-- Igual que sus hermanas: SECURITY DEFINER con p_tenant NO puede quedar expuesta a
-- anon/PUBLIC (sería fuga cross-tenant).
revoke all on function public.get_manager_roster_stats(uuid, date) from public, anon;
grant execute on function public.get_manager_roster_stats(uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) get_manager_growth_feed — consciente de la RED donde promociona
-- ---------------------------------------------------------------------------
-- Agrega promo_networks + ig_has_data AL FINAL de la tabla (los consumidores
-- —tool get_manager_growth_feed, promolog-manager-tick, alvaro_pulse— leen por
-- NOMBRE, así que agregar columnas al final no los rompe).
-- Hay que DROP porque cambia el tipo de retorno (create or replace no lo permite).
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
  promo_networks text, ig_has_data boolean
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
      -- covered_days = días REALMENTE LEÍDOS (al menos una entry NO-pending ese día).
      -- Antes contaba error_reason<>'scrape_no_media' (incluía los pending) → inflaba.
      count(distinct e.date::date) filter (where coalesce(e.promoted,'') <> 'pending') as covered_days
    from promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.date >= b.this_start::timestamptz
    group by e.creator_id
  ),
  -- Días de promo POR RED este mes → para saber DÓNDE promociona realmente.
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
  -- ¿Tenemos ALGÚN dato utilizable de Instagram este mes? Si todas las entries de IG
  -- quedaron 'pending' (o no hay ninguna), el score de calidad basado en historias de
  -- IG NO aplica y no se puede culpar a IG por la caída.
  ig as (
    select e.creator_id, bool_or(coalesce(e.promoted,'') <> 'pending') as ig_has_data
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
      coalesce(g.ig_has_data, false) as ig_has_data,
      -- low_promo: tasa sobre DÍAS LEÍDOS, con piso de 5 días leídos para tener con qué juzgar.
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
        format('Promociona bien (%s/%s días leídos) pero sus ingresos caen %s%% (al día %s vs mismo tramo del mes pasado) → revisar CALIDAD/estrategia%s',
               s.promo_days, s.covered_days, abs(s.income_trend_pct), s.income_day,
               case when s.ig_has_data
                    then format(' [promo en %s]', coalesce(s.promo_networks,'—'))
                    else format(' ⚠️ SIN dato de Instagram este mes — su promo es en %s: NO atribuyas la caída a las historias de IG, revisá la calidad EN ESAS REDES', coalesce(s.promo_networks,'otras redes'))
               end)
      when s.low_promo and (not s.income_down) then
        format('Promociona poco (%s/%s días leídos este mes) — ingreso aún ok, pero riesgo a futuro → sumar promo/otra red%s',
               s.promo_days, s.covered_days,
               case when s.promo_networks is null then '' else format(' [promo en %s]', s.promo_networks) end)
      else 'Sana' end as diagnosis,
    s.promo_networks,
    s.ig_has_data
  from scored s
  where not (s.low_promo = false and s.income_down = false)
  order by priority, s.income_mtd desc;
$function$;

comment on function public.get_manager_growth_feed(uuid, numeric, numeric) is
  'Radar promo×ingreso por creadora en alerta. promo_networks/ig_has_data: cuando ig_has_data=false el veredicto de calidad NO debe atribuirse a historias de IG (no hay dato).';

revoke all on function public.get_manager_growth_feed(uuid, numeric, numeric) from public, anon;
grant execute on function public.get_manager_growth_feed(uuid, numeric, numeric) to authenticated, service_role;
