-- Venta por chatter POR DÍA (BLU employee-reports pedido día a día por el blu-bridge).
-- chatter_performance es un snapshot MENSUAL; esto permite diarizar la venta/ROI del subtab
-- Productividad por rango de fechas (como ya se hizo con las horas de Hubstaff). management-only.
create table if not exists public.chatter_daily_sales (
  blu_employee_id integer not null,
  date date not null,
  name text,
  total_sales numeric not null default 0,
  sold_messages integer default 0,
  fans_chatted integer default 0,
  updated_at timestamptz not null default now(),
  primary key (blu_employee_id, date)
);

alter table public.chatter_daily_sales enable row level security;

drop policy if exists chatter_daily_sales_select on public.chatter_daily_sales;
create policy chatter_daily_sales_select on public.chatter_daily_sales
  for select to authenticated using (public.blu_is_management(auth.uid()));

grant select on public.chatter_daily_sales to authenticated;

-- Ingesta idempotente desde el blu-bridge (service_role). Upsert por (blu_employee_id, date).
create or replace function public.import_blu_chatter_daily(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  insert into public.chatter_daily_sales (blu_employee_id, date, name, total_sales, sold_messages, fans_chatted, updated_at)
  select (r->>'blu_employee_id')::int,
         (r->>'date')::date,
         r->>'name',
         coalesce((r->>'total_sales')::numeric, 0),
         coalesce((r->>'sold_messages')::int, 0),
         coalesce((r->>'fans_chatted')::int, 0),
         now()
  from jsonb_array_elements(p_rows) r
  where r ? 'blu_employee_id' and r ? 'date'
  on conflict (blu_employee_id, date) do update set
    total_sales = excluded.total_sales,
    sold_messages = excluded.sold_messages,
    fans_chatted = excluded.fans_chatted,
    name = coalesce(excluded.name, public.chatter_daily_sales.name),
    updated_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.import_blu_chatter_daily(jsonb) to service_role;
