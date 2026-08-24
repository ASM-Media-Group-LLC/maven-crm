-- Total BRUTO por MES de los últimos p_months meses (incluye el mes en curso, parcial).
-- Alimenta el sparkline de "Comparativas" del tab Ventas (/sales-overview): antes exigía
-- tener el histórico completo (~40.9k filas) en el browser; ahora son p_months filas en
-- 1 request. El mes se bucketea sobre la columna `date` (día ya en hora de Colombia, la
-- escribe el bridge de BLU) y el "mes actual" se ancla a America/Bogota para que el
-- primer mes del rango no se corra un día por UTC cerca del cambio de mes.
-- Mismo gate que get_dashboard2_creator_summary (blu_is_management + SECURITY DEFINER).
create or replace function public.get_sales_monthly_totals(p_months int)
returns table (
  month date,
  total_gross numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_first_month date;
begin
  if not coalesce(public.blu_is_management(auth.uid()), false) then
    raise exception 'forbidden: management only' using errcode = '42501';
  end if;
  if p_months is null or p_months < 1 or p_months > 60 then
    raise exception 'p_months debe estar entre 1 y 60';
  end if;
  v_first_month := (date_trunc('month', timezone('America/Bogota', now()))
                    - make_interval(months => p_months - 1))::date;
  return query
  select
    date_trunc('month', e.date)::date        as month,
    coalesce(sum(e.total_gross), 0)::numeric as total_gross
  from public.creator_daily_earnings e
  where e.date >= v_first_month
  group by 1
  order by 1;
end;
$$;

revoke all on function public.get_sales_monthly_totals(int) from public, anon;
grant execute on function public.get_sales_monthly_totals(int) to authenticated;

notify pgrst, 'reload schema';
