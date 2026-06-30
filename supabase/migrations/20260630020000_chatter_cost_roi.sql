-- Costo / ROI por chatter (Hubstaff #3). Decisiones del dueño (2026-06-30):
--  - El % firmado de la agencia se aplica sobre el NETO que recibe la modelo (= bruto × 0.80, OF se queda 20%).
--    Fuente del % por modelo: creator_business.agency_percentage. Como total_sales viene pre-agregado por chatter
--    sobre N modelos con % distintos, usamos un % EFECTIVO ponderado por ingreso (no un 30% plano).
--  - Costo del chatter = salario base 2.000.000 COP/mes (igual para todos). Sin comisión por ahora ("piso de costo").
--    pay_rate de Hubstaff = $1 dummy → NO sirve; el costo se parametriza acá.
--  - FX COP→USD en vivo (BLU es USD): el micro hubstaff-bridge lo refresca cada corrida (open.er-api.com).
-- Ingreso agencia (USD) = total_sales × of_net_factor × effective_agency_rate/100.

-- ── Config (fila única, parámetros editables por management) ───────────────────────────────
create table if not exists public.chatter_cost_config (
  id                     boolean primary key default true,
  base_salary_cop        numeric(14,2) not null default 2000000,   -- salario base mensual del chatter (COP)
  fx_cop_per_usd         numeric(12,4) not null default 4000,       -- COP por 1 USD (lo refresca el bridge)
  of_net_factor          numeric(5,4)  not null default 0.80,       -- modelo recibe 80% del bruto (OF se queda 20%)
  effective_agency_rate  numeric(6,4)  not null default 30,         -- % efectivo ponderado de la agencia (0-100)
  fx_updated_at          timestamptz,
  rate_updated_at        timestamptz,
  updated_at             timestamptz not null default now(),
  constraint chatter_cost_config_singleton check (id = true)
);

-- Seed con los valores reales medidos el 2026-06-30 (FX 3455.53; % efectivo ponderado 28.83).
insert into public.chatter_cost_config
  (id, base_salary_cop, fx_cop_per_usd, of_net_factor, effective_agency_rate, fx_updated_at, rate_updated_at)
values
  (true, 2000000, 3455.5300, 0.80, 28.8300, now(), now())
on conflict (id) do nothing;

alter table public.chatter_cost_config enable row level security;

-- Salarios → sensible: solo management/admin lee y edita. (service_role bypassa RLS → el bridge puede escribir.)
drop policy if exists chatter_cost_config_mgmt_read on public.chatter_cost_config;
create policy chatter_cost_config_mgmt_read on public.chatter_cost_config
  for select to authenticated
  using (public.blu_is_management(auth.uid()) or public.has_role(auth.uid(), 'admin'::text));

drop policy if exists chatter_cost_config_mgmt_write on public.chatter_cost_config;
create policy chatter_cost_config_mgmt_write on public.chatter_cost_config
  for all to authenticated
  using (public.blu_is_management(auth.uid()) or public.has_role(auth.uid(), 'admin'::text))
  with check (public.blu_is_management(auth.uid()) or public.has_role(auth.uid(), 'admin'::text));

grant select on public.chatter_cost_config to authenticated;

-- ── RPC de refresco (lo llama el bridge cada corrida) ──────────────────────────────────────
-- Recalcula el % efectivo ponderado por ingreso del mes en curso y actualiza FX si se le pasa.
-- gate: hubstaff_can_write() = service_role | management (mismo patrón que el resto del bridge).
create or replace function public.refresh_chatter_cost_config(p_fx numeric default null)
returns public.chatter_cost_config
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate numeric;
  v_row  public.chatter_cost_config;
begin
  if not public.hubstaff_can_write() then
    raise exception 'forbidden';
  end if;

  -- % efectivo = promedio de agency_percentage ponderado por bruto del mes (NULL → default 30).
  select round((sum(g.gross * coalesce(g.pct, 30)) / nullif(sum(g.gross), 0))::numeric, 4)
    into v_rate
  from (
    select cde.creator_id,
           sum(cde.total_gross) as gross,
           max(cb.agency_percentage) as pct
    from public.creator_daily_earnings cde
    left join public.creator_business cb on cb.creator_id = cde.creator_id
    where cde.date >= date_trunc('month', current_date)
    group by cde.creator_id
  ) g;

  update public.chatter_cost_config
     set fx_cop_per_usd        = coalesce(p_fx, fx_cop_per_usd),
         fx_updated_at         = case when p_fx   is not null then now() else fx_updated_at end,
         effective_agency_rate = coalesce(v_rate, effective_agency_rate),
         rate_updated_at       = case when v_rate is not null then now() else rate_updated_at end,
         updated_at            = now()
   where id = true
   returning * into v_row;

  return v_row;
end $$;

revoke all on function public.refresh_chatter_cost_config(numeric) from public, anon;
grant execute on function public.refresh_chatter_cost_config(numeric) to authenticated, service_role;

-- ── View: añade costo/ingreso-agencia/margen/ROI por chatter (solo se appende al final) ─────
-- security_invoker → respeta RLS: las columnas de costo solo aparecen pobladas para management
-- (el LEFT JOIN a chatter_cost_config devuelve NULL si el invocador no puede leer la config).
create or replace view public.v_chatter_hubstaff_effort
with (security_invoker = true) as
select
  h.blu_employee_id,
  h.name,
  h.period,
  h.days_tracked,
  h.total_hours,
  h.avg_activity_pct,
  round(coalesce(cp.total_sales, 0))::int                            as sales,
  round(coalesce(cp.total_sales, 0) / nullif(h.total_hours, 0))::int as sales_per_hour,
  round(cp.avg_response_seconds / 60.0)::int                         as avg_response_min,
  cp.unlock_rate,
  cp.sold_messages,
  cp.fans_chatted,
  (h.total_hours >= 25 and h.avg_activity_pct >= 50
     and round(coalesce(cp.total_sales,0) / nullif(h.total_hours,0)) < 15) as online_improductivo,
  -- ── costo / ROI (admin-only vía cfg) ──
  round(cfg.base_salary_cop / nullif(cfg.fx_cop_per_usd, 0))::int     as cost_usd,
  round(coalesce(cp.total_sales,0) * cfg.of_net_factor
        * cfg.effective_agency_rate / 100.0)::int                    as agency_revenue_usd,
  round(coalesce(cp.total_sales,0) * cfg.of_net_factor * cfg.effective_agency_rate / 100.0
        - cfg.base_salary_cop / nullif(cfg.fx_cop_per_usd, 0))::int  as margin_usd,
  round((coalesce(cp.total_sales,0) * cfg.of_net_factor * cfg.effective_agency_rate / 100.0)
        / nullif(cfg.base_salary_cop / nullif(cfg.fx_cop_per_usd, 0), 0), 2) as roi_x,
  ((coalesce(cp.total_sales,0) * cfg.of_net_factor * cfg.effective_agency_rate / 100.0)
        < cfg.base_salary_cop / nullif(cfg.fx_cop_per_usd, 0))        as no_rentable,
  cfg.effective_agency_rate                                          as agency_rate_used
from public.v_chatter_hubstaff_monthly h
join public.chatter_performance cp on cp.blu_employee_id = h.blu_employee_id
left join public.chatter_cost_config cfg on cfg.id = true;

grant select on public.v_chatter_hubstaff_effort to authenticated;
