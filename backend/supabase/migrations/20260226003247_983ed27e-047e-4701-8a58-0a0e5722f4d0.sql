
create table public.internal_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text,
  announcement_type text not null default 'general',
  priority text not null default 'normal',
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.internal_announcements enable row level security;

create policy "Authenticated users can read announcements"
  on public.internal_announcements for select
  to authenticated using (true);

create policy "Authenticated users can manage announcements"
  on public.internal_announcements for all
  to authenticated using (true) with check (true);
