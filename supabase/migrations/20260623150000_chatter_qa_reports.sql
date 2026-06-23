-- Módulo "QA cualitativo de chatters" (QA-B): reemplaza el correo del supervisor con un
-- reporte estructurado por (chatter, company, period) + borrador IA desde Mensajes Pro.
-- Patrón de durabilidad de Closers QA (processing→ready/failed + Reintentar). El cuerpo del
-- correo vive en el jsonb `report`. RLS management (blu_is_management). service_role bypassa.
-- (Ya aplicada en prod vía MCP el 2026-06-23; este archivo versiona el schema.)
create table if not exists public.chatter_qa_reports (
  id uuid primary key default gen_random_uuid(),
  chatter_name text not null,
  company text not null check (company in ('CP','CM','CU')),
  period date not null,
  blu_employee_id bigint,
  evaluated_models jsonb not null default '[]'::jsonb,         -- [{model_id, model_name}]
  report jsonb not null default '{}'::jsonb,                   -- intro/resumen/positivos/mejoras/observaciones/recomendaciones/conclusion/hallazgo
  veredicto text check (veredicto in ('excelente','bueno','requiere_mejora','critico')),
  sampling jsonb not null default '{}'::jsonb,
  evaluator_name text not null default 'Claude AI',
  source text not null default 'ai_draft',                     -- ai_draft | manual | ai_edited
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  error_message text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chatter_name, company, period)
);

create index if not exists idx_chatter_qa_reports_period on public.chatter_qa_reports (period desc, company);
create index if not exists idx_chatter_qa_reports_blu on public.chatter_qa_reports (blu_employee_id) where blu_employee_id is not null;
create index if not exists idx_chatter_qa_reports_status on public.chatter_qa_reports (status) where status <> 'ready';

alter table public.chatter_qa_reports enable row level security;
drop policy if exists chatter_qa_reports_select on public.chatter_qa_reports;
create policy chatter_qa_reports_select on public.chatter_qa_reports for select to authenticated using (public.blu_is_management(auth.uid()));
drop policy if exists chatter_qa_reports_insert on public.chatter_qa_reports;
create policy chatter_qa_reports_insert on public.chatter_qa_reports for insert to authenticated with check (public.blu_is_management(auth.uid()));
drop policy if exists chatter_qa_reports_update on public.chatter_qa_reports;
create policy chatter_qa_reports_update on public.chatter_qa_reports for update to authenticated using (public.blu_is_management(auth.uid())) with check (public.blu_is_management(auth.uid()));
drop policy if exists chatter_qa_reports_delete on public.chatter_qa_reports;
create policy chatter_qa_reports_delete on public.chatter_qa_reports for delete to authenticated using (public.blu_is_management(auth.uid()));

create or replace function public.touch_chatter_qa_reports() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_touch_chatter_qa_reports on public.chatter_qa_reports;
create trigger trg_touch_chatter_qa_reports before update on public.chatter_qa_reports
  for each row execute function public.touch_chatter_qa_reports();

create table if not exists public.chatter_qa_section_feedback (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.chatter_qa_reports(id) on delete cascade,
  section_type text not null,
  section_index int not null,
  section_label text,
  thumbs smallint not null check (thumbs in (1, -1)),
  note text,
  evaluator_name text,
  created_at timestamptz not null default now(),
  unique (report_id, section_type, section_index)
);
alter table public.chatter_qa_section_feedback enable row level security;
drop policy if exists chatter_qa_sfb_all on public.chatter_qa_section_feedback;
create policy chatter_qa_sfb_all on public.chatter_qa_section_feedback
  for all to authenticated using (public.blu_is_management(auth.uid())) with check (public.blu_is_management(auth.uid()));
