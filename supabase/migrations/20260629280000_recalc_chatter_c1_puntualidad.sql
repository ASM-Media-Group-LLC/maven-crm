-- c1 (Puntualidad): deduce el turno de cada chatter (cluster de inicios → 8-4 / 4-12 / 12-8 madrugada,
-- en hora Colombia) y puntúa % de días que arrancó dentro de la tolerancia → nota 0-5.
-- Guarda de mínimo de días (default 5): no puntúa con muestra chica (evita 0s injustos sobre 1-2 días).
-- Tolerancia y rubric son parámetros → ajustables. Solo toca c1; total es GENERATED. c4 va en su RPC.
-- La llama el bridge (service_role) cada corrida; se va completando a medida que se acumulan días del mes.
create or replace function public.recalc_chatter_c1_puntualidad(
  p_period date, p_min_days int default 5, p_tolerance_min int default 10
)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not (coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role','') = 'service_role'
          or public.blu_is_management(auth.uid())) then
    raise exception 'forbidden: solo service_role/management' using errcode = '42501';
  end if;
  with base as (
    select cp.blu_employee_id,
      (extract(hour from (d.first_activity_at at time zone 'America/Bogota'))*60
       + extract(minute from (d.first_activity_at at time zone 'America/Bogota')))::int as mod
    from public.hubstaff_daily_data d
    join public.hubstaff_members hm on hm.hubstaff_user_id = d.hubstaff_user_id
    join public.chatter_performance cp on lower(btrim(cp.email)) = lower(btrim(hm.email)) and cp.is_chatter = true
    where d.first_activity_at is not null and date_trunc('month', d.date)::date = p_period and cp.blu_employee_id is not null
  ),
  perday as (
    select blu_employee_id, mod,
      -- turno más cercano (en minutos desde medianoche, circular): 0 (12am), 480 (8am), 960 (4pm)
      case when least(mod,1440-mod) <= abs(mod-480) and least(mod,1440-mod) <= abs(mod-960) then 0
           when abs(mod-480) <= abs(mod-960) then 480 else 960 end as shift_start
    from base
  ),
  perday2 as (select *, (((mod - shift_start + 720) % 1440) - 720) as dev from perday),  -- dev>0 = tarde, <0 = temprano
  agg as (
    select blu_employee_id, count(*) as dias,
      round(100.0 * count(*) filter (where dev <= p_tolerance_min) / count(*))::int as pct
    from perday2 group by blu_employee_id
  )
  update public.chatter_scorecards sc
  set c1_puntualidad = case
        when a.pct >= 100 then 5 when a.pct >= 90 then 4 when a.pct >= 80 then 3
        when a.pct >= 65 then 2 when a.pct >= 50 then 1 else 0 end
  from agg a
  where sc.blu_employee_id = a.blu_employee_id and sc.period = p_period and a.dias >= p_min_days;
  get diagnostics n = row_count;
  return jsonb_build_object('period', p_period, 'rows_updated', n, 'min_days', p_min_days, 'tolerance_min', p_tolerance_min);
end $$;
revoke all on function public.recalc_chatter_c1_puntualidad(date, int, int) from public, anon;
grant execute on function public.recalc_chatter_c1_puntualidad(date, int, int) to authenticated, service_role;
