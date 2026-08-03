-- El reporte de Managers decía "0 creadoras para empujar (0 críticas)" y se leía
-- como "todo bien". No lo era: get_manager_growth_feed exige `covered_days >= 5`
-- (días LEÍDOS del mes en curso, umbral deliberado para no juzgar con poco dato),
-- y los primeros 4 días de CADA mes ninguna creadora puede llegar a 5.
-- Verificado el 03/08: 59 creadoras con manager, max covered_days = 3, 0 pasaban.
--
-- O sea: el cálculo estaba bien y el MENSAJE mentía por omisión. "0 para empujar"
-- (evaluado, no hay) y "todavía no puedo evaluar" son cosas distintas, y una de
-- ellas hace que Álvaro no revise nada durante los primeros días del mes.
-- Misma familia que "no pude leer" → "no promocionó".
do $mig$
declare
  def text;
  ev_cte constant text :=
$ev$  ev as (
    select p.full_name as manager_name,
           count(*) filter (where x.cd >= 5)::int as evaluables,
           count(*)::int as total
    from (
      select c.id, c.assigned_manager_profile_id as mgr,
             (select count(distinct e.dia) from promolog_entries e
               where e.creator_id = c.id and e.tenant_id = v_tenant
                 and e.dia >= date_trunc('month',(now() at time zone 'America/Bogota')::date)::date
                 and coalesce(e.promoted,'') <> 'pending') as cd
      from creators c
      where c.status = 'active' and c.assigned_manager_profile_id is not null
    ) x
    join profiles p on p.id = x.mgr
    group by 1
  ),
  sc as ($ev$;
  fmt_viejo constant text :=
$v$contactadas hoy%s',
          split_part(coalesce(ga.manager_name, sc.manager_name),' ',1),
          coalesce(ga.need,0), coalesce(ga.crit,0), coalesce(sc.silent,0),$v$;
  fmt_nuevo constant text :=
$n$contactadas hoy%s',
          split_part(coalesce(ga.manager_name, sc.manager_name),' ',1),
          -- Sin ninguna creadora evaluable, "0 para empujar" sería falso: no es que
          -- no haya, es que todavía no hay mes suficiente para saberlo.
          case when coalesce(ev.evaluables,0) = 0
               then format('promo AÚN NO EVALUABLE este mes (día %s; hacen falta 5 días leídos por creadora)',
                           extract(day from (now() at time zone 'America/Bogota')::date)::int)
               else format('%s creadoras para empujar (%s críticas)', coalesce(ga.need,0), coalesce(ga.crit,0)) end,
          coalesce(sc.silent,0),$n$;
  join_viejo constant text :=
$jv$      left join per_mgr pm on pm.mgr = split_part(coalesce(ga.manager_name, sc.manager_name),' ',1)),$jv$;
  join_nuevo constant text :=
$jn$      left join per_mgr pm on pm.mgr = split_part(coalesce(ga.manager_name, sc.manager_name),' ',1)
      left join ev on ev.manager_name = coalesce(ga.manager_name, sc.manager_name)),$jn$;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'alvaro_pulse';

  if position('  sc as (' in def) = 0 then raise exception 'no encontré el CTE sc'; end if;
  if position(fmt_viejo in def) = 0 then raise exception 'no encontré el format de managers'; end if;
  if position(join_viejo in def) = 0 then raise exception 'no encontré el join de per_mgr'; end if;

  def := replace(def, '  sc as (', ev_cte);
  def := replace(def, fmt_viejo, fmt_nuevo);
  def := replace(def, join_viejo, join_nuevo);

  execute def;
end
$mig$;
