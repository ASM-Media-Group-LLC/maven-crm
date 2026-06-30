-- D5 · Nómina/costo de RRHH SIN captura per-empleado: base salary por ROL (editable in-app)
-- + vista v_hr_payroll que cruza costo vs ingreso atribuido por persona.
-- Chatters: costo/ingreso/margen MODELADOS (base+comisión, ya en v_chatter_hubstaff_effort).
-- Otros roles: costo = base_salary_cop del rol / FX; sin ingreso atribuido directo.

-- ── Config de costo base por rol ──
create table if not exists public.hr_role_cost (
  role text primary key,
  base_salary_cop numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.hr_role_cost enable row level security;

-- Management lee y edita; nadie más.
drop policy if exists hr_role_cost_select on public.hr_role_cost;
create policy hr_role_cost_select on public.hr_role_cost
  for select to authenticated using (public.blu_is_management(auth.uid()));

drop policy if exists hr_role_cost_write on public.hr_role_cost;
create policy hr_role_cost_write on public.hr_role_cost
  for all to authenticated
  using (public.blu_is_management(auth.uid()))
  with check (public.blu_is_management(auth.uid()));

grant select, insert, update on public.hr_role_cost to authenticated;

-- Seed con los roles existentes. Chatter = base real (2M, igual que chatter_cost_config);
-- el resto en 0 = "definir" (el dueño los carga desde la UI). No inventamos salarios.
insert into public.hr_role_cost (role, base_salary_cop) values
  ('Chatter', 2000000),
  ('closer', 0),
  ('manager', 0),
  ('LLG', 0),
  ('Team Leader', 0),
  ('Chatter Supervisor', 0),
  ('coordinator_beta', 0),
  ('admin', 0),
  ('spammer', 0),
  ('employee', 0)
on conflict (role) do nothing;

-- ── Vista de nómina por persona ──
create or replace view public.v_hr_payroll
with (security_invoker = true) as
with cfg as (
  select fx_cop_per_usd as fx from public.chatter_cost_config limit 1
),
ch as (
  -- último período de esfuerzo de chatter por nombre (costo/ingreso/margen modelados)
  select distinct on (lower(name)) lower(name) as lname, cost_usd, agency_revenue_usd, margin_usd, roi_x
  from public.v_chatter_hubstaff_effort
  order by lower(name), period desc
)
select
  r.profile_id,
  r.name,
  r.role,
  r.in_hubstaff,
  coalesce(rc.base_salary_cop, 0) as base_salary_cop,
  -- costo USD: chatter matcheado → modelado (base+comisión); si no, base/FX
  coalesce(
    case when r.role = 'Chatter' then ch.cost_usd end,
    round((coalesce(rc.base_salary_cop, 0) / nullif((select fx from cfg), 0))::numeric, 0)
  ) as cost_usd,
  case when r.role = 'Chatter' then ch.agency_revenue_usd else null end as revenue_usd,
  case when r.role = 'Chatter' then ch.margin_usd else null end as margin_usd,
  case when r.role = 'Chatter' then ch.roi_x else null end as roi_x,
  (r.role = 'Chatter' and ch.lname is not null) as cost_modelado
from public.v_hr_roster r
left join public.hr_role_cost rc on rc.role = r.role
left join ch on ch.lname = lower(r.name);

grant select on public.v_hr_payroll to authenticated;
