-- Módulo "QA de Chatters" · Scorecard mensual (reemplaza el sheet "Medidor de chatters").
-- 8 criterios 0-5 → total /40 → % (color en frontend). Agrupado por compañía CP/CM/CU.
-- (Ya aplicada en prod vía MCP el 2026-06-23; este archivo versiona el schema.)
create table if not exists public.chatter_scorecards (
  id uuid primary key default gen_random_uuid(),
  chatter_name text not null,
  company text not null check (company in ('CP','CM','CU')),      -- CP=Kash Plus, CM=Kash Massive, CU=Unlok
  period date not null,                                            -- primer día del mes (YYYY-MM-01)
  blu_employee_id bigint,                                          -- link opcional al empleado BLU (Hubstaff/Mensajes Pro)
  c1_puntualidad            smallint check (c1_puntualidad            between 0 and 5),  -- Puntualidad y Cumplimiento (Hubstaff)
  c2_calidad_chats          smallint check (c2_calidad_chats          between 0 and 5),  -- Calidad de chats
  c3_cumplimiento_meta      smallint check (c3_cumplimiento_meta      between 0 and 5),  -- Cumplimiento de Meta
  c4_productividad_hubstaff smallint check (c4_productividad_hubstaff between 0 and 5),  -- Productividad Hubstaff (Hubstaff)
  c5_actitud_disciplina     smallint check (c5_actitud_disciplina     between 0 and 5),  -- Actitud y disciplina
  c6_gestion_estrategia     smallint check (c6_gestion_estrategia     between 0 and 5),  -- Gestión y estrategia
  c7_scripts                smallint check (c7_scripts                between 0 and 5),  -- Scripts
  c8_camara_pantalla        smallint check (c8_camara_pantalla        between 0 and 5),  -- Cámara y Pantalla
  total smallint generated always as (
    coalesce(c1_puntualidad,0)+coalesce(c2_calidad_chats,0)+coalesce(c3_cumplimiento_meta,0)+
    coalesce(c4_productividad_hubstaff,0)+coalesce(c5_actitud_disciplina,0)+coalesce(c6_gestion_estrategia,0)+
    coalesce(c7_scripts,0)+coalesce(c8_camara_pantalla,0)
  ) stored,
  note text,
  source text not null default 'manual',                          -- manual | import_sheet | hubstaff
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chatter_name, company, period)
);

create index if not exists idx_chatter_scorecards_period on public.chatter_scorecards (period desc, company);
create index if not exists idx_chatter_scorecards_blu on public.chatter_scorecards (blu_employee_id) where blu_employee_id is not null;

alter table public.chatter_scorecards enable row level security;

-- Solo management (admin/manager/owner). service_role bypassa RLS.
drop policy if exists chatter_scorecards_select on public.chatter_scorecards;
create policy chatter_scorecards_select on public.chatter_scorecards
  for select to authenticated using (public.blu_is_management(auth.uid()));
drop policy if exists chatter_scorecards_insert on public.chatter_scorecards;
create policy chatter_scorecards_insert on public.chatter_scorecards
  for insert to authenticated with check (public.blu_is_management(auth.uid()));
drop policy if exists chatter_scorecards_update on public.chatter_scorecards;
create policy chatter_scorecards_update on public.chatter_scorecards
  for update to authenticated using (public.blu_is_management(auth.uid())) with check (public.blu_is_management(auth.uid()));
drop policy if exists chatter_scorecards_delete on public.chatter_scorecards;
create policy chatter_scorecards_delete on public.chatter_scorecards
  for delete to authenticated using (public.blu_is_management(auth.uid()));

create or replace function public.touch_chatter_scorecards() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_touch_chatter_scorecards on public.chatter_scorecards;
create trigger trg_touch_chatter_scorecards before update on public.chatter_scorecards
  for each row execute function public.touch_chatter_scorecards();
