-- Cohortes de retención para Dashboard v2: agrega creator_fan_retention server-side.
-- Devuelve formato largo (cohort_date, day_offset, retention_pct) + tamaño de cohorte.
-- after_days = array jsonb de % retenido por día-offset (0..N). Ponderamos por new_fans
-- para poolear varias creadoras. SECURITY INVOKER → respeta el RLS existente
-- (cfr_select_management); la agregación corre en el server (no se bajan filas crudas).
create or replace function public.dashboard2_cohort_retention(
  p_from date,
  p_to date,
  p_creator uuid default null
)
returns table (
  cohort_date date,
  cohort_size bigint,
  day_offset int,
  retention_pct numeric
)
language sql
stable
set search_path = public
as $$
  with src as (
    select r.cohort_date, r.new_fans, r.after_days
    from creator_fan_retention r
    where r.cohort_date between p_from and p_to
      and coalesce(r.new_fans, 0) > 0
      and (p_creator is null or r.creator_id = p_creator)
  ),
  sizes as (
    select cohort_date, sum(new_fans)::bigint as cohort_size
    from src group by cohort_date
  ),
  exploded as (
    select s.cohort_date, s.new_fans,
           (e.ordinality - 1)::int as day_offset,
           nullif(e.value, 'null')::numeric as val
    from src s
    cross join lateral jsonb_array_elements_text(s.after_days) with ordinality as e(value, ordinality)
  )
  select x.cohort_date,
         z.cohort_size,
         x.day_offset,
         round(sum(x.new_fans * x.val) / nullif(sum(x.new_fans), 0), 1) as retention_pct
  from exploded x
  join sizes z on z.cohort_date = x.cohort_date
  where x.val is not null
  group by x.cohort_date, z.cohort_size, x.day_offset
  order by x.cohort_date, x.day_offset;
$$;

grant execute on function public.dashboard2_cohort_retention(date, date, uuid) to authenticated;
