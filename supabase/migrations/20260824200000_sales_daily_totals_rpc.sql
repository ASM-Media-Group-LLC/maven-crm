-- Totales POR DÍA de creator_daily_earnings para un rango [p_from, p_to], server-side.
-- Alimenta los charts del tab Ventas (/sales-overview): antes la página se bajaba el
-- histórico COMPLETO crudo (~40.9k filas, ~13MB, 43 requests) para agrupar por día en
-- JS; ahora el browser recibe 1 fila por día del rango (~31 filas/mes) en 1 request.
-- SECURITY DEFINER (saltea RLS) → gateado con blu_is_management(auth.uid()) igual que
-- get_dashboard2_creator_summary, para preservar el mismo control de acceso que la
-- policy cde_management de la tabla. Usa idx_cde_date (rango sobre e.date).
create or replace function public.get_sales_daily_totals(p_from date, p_to date)
returns table (
  date date,
  total_gross numeric,
  subscription_gross numeric,
  tips_gross numeric,
  message_gross numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.blu_is_management(auth.uid()), false) then
    raise exception 'forbidden: management only' using errcode = '42501';
  end if;
  return query
  select
    e.date                                          as date,
    coalesce(sum(e.total_gross), 0)::numeric        as total_gross,
    coalesce(sum(e.subscription_gross), 0)::numeric as subscription_gross,
    coalesce(sum(e.tips_gross), 0)::numeric         as tips_gross,
    coalesce(sum(e.message_gross), 0)::numeric      as message_gross
  from public.creator_daily_earnings e
  where e.date >= p_from and e.date <= p_to
  group by e.date
  order by e.date;
end;
$$;

revoke all on function public.get_sales_daily_totals(date, date) from public, anon;
grant execute on function public.get_sales_daily_totals(date, date) to authenticated;

notify pgrst, 'reload schema';
