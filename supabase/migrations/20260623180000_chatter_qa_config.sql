-- Config de notificaciones del QA de Chatters (singleton id=1) + columna email_sent_at.
-- RLS blu_is_management (consistente con chatter_qa_reports), no tenant-scope como qa_config.
-- (Aplicada en prod vía MCP el 2026-06-23.)
create table if not exists public.chatter_qa_config (
  id int primary key default 1 check (id = 1),
  notification_emails text[] not null default '{}',
  notify_user_ids uuid[] not null default '{}',
  notify_on_analyzed boolean not null default true,   -- borrador IA listo
  notify_on_low_score boolean not null default true,  -- veredicto requiere_mejora/critico
  notify_on_failed boolean not null default true,     -- análisis IA falló
  updated_at timestamptz not null default now()
);
insert into public.chatter_qa_config (id) values (1) on conflict (id) do nothing;

alter table public.chatter_qa_config enable row level security;
drop policy if exists chatter_qa_config_rw on public.chatter_qa_config;
create policy chatter_qa_config_rw on public.chatter_qa_config for all to authenticated
  using (public.blu_is_management(auth.uid())) with check (public.blu_is_management(auth.uid()));

create or replace function public.touch_chatter_qa_config() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_touch_chatter_qa_config on public.chatter_qa_config;
create trigger trg_touch_chatter_qa_config before update on public.chatter_qa_config
  for each row execute function public.touch_chatter_qa_config();

alter table public.chatter_qa_reports add column if not exists email_sent_at timestamptz;