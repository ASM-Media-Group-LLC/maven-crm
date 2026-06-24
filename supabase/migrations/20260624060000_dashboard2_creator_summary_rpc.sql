-- Agrega creator_daily_earnings POR CREADORA para un rango [p_from, p_to], server-side.
-- Reemplaza el patrón de Dashboard v2 que se bajaba las 13k+ filas crudas al browser
-- (14 round-trips, sin caché) y agregaba en JS. Ahora el browser recibe ~56 filas
-- (1 por creadora) en 1 request. Mismos cálculos que hacía el front (sum de montos,
-- MAX de active_fans, count de días, last_date) + af_sum/af_days para el ARPU del LTV.
-- SECURITY DEFINER (saltea RLS) → gateado con blu_is_management() para preservar el
-- mismo control de acceso que la policy cde_management de la tabla.
create or replace function public.get_dashboard2_creator_summary(p_from date, p_to date)
returns table (
  group_key text,
  creator_id uuid,
  blu_creator_name text,
  artistic_name text,
  total numeric,
  subs numeric,
  new_sub numeric,
  recurring_sub numeric,
  tips numeric,
  messages numeric,
  max_active_fans numeric,
  new_fans numeric,
  days_with_data integer,
  last_date date,
  af_sum numeric,
  af_days integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.blu_is_management(), false) then
    raise exception 'forbidden: management only' using errcode = '42501';
  end if;
  return query
  select
    coalesce(e.creator_id::text, e.blu_creator_name, e.id::text) as group_key,
    max(e.creator_id)                                            as creator_id,
    max(e.blu_creator_name)                                      as blu_creator_name,
    max(c.artistic_name)                                         as artistic_name,
    coalesce(sum(e.total_gross), 0)                              as total,
    coalesce(sum(e.subscription_gross), 0)                       as subs,
    coalesce(sum(e.new_sub_gross), 0)                            as new_sub,
    coalesce(sum(e.recurring_sub_gross), 0)                      as recurring_sub,
    coalesce(sum(e.tips_gross), 0)                               as tips,
    coalesce(sum(e.message_gross), 0)                            as messages,
    coalesce(max(e.active_fans), 0)                              as max_active_fans,
    coalesce(sum(e.new_fans), 0)                                 as new_fans,
    count(*)::integer                                            as days_with_data,
    max(e.date)                                                  as last_date,
    coalesce(sum(e.active_fans) filter (where e.active_fans > 0), 0) as af_sum,
    count(*) filter (where e.active_fans > 0)::integer           as af_days
  from public.creator_daily_earnings e
  left join public.creators c on c.id = e.creator_id
  where e.date >= p_from and e.date <= p_to
  group by coalesce(e.creator_id::text, e.blu_creator_name, e.id::text);
end;
$$;

revoke all on function public.get_dashboard2_creator_summary(date, date) from public, anon;
grant execute on function public.get_dashboard2_creator_summary(date, date) to authenticated;
