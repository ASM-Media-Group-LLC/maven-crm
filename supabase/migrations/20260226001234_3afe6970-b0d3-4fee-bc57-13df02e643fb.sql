
-- Create audit_log table
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.audit_log enable row level security;

-- Allow authenticated users to read audit logs
create policy "Authenticated users can read audit_log"
  on public.audit_log for select to authenticated
  using (true);

-- Allow inserts from triggers (security definer functions bypass RLS)
create policy "System can insert audit_log"
  on public.audit_log for insert to authenticated
  with check (true);

-- Create index for faster queries
create index idx_audit_log_created_at on public.audit_log (created_at desc);

-- Trigger function for user_roles changes
create or replace function public.log_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.audit_log (user_id, action, target_type, target_id, details)
    values (NEW.user_id, 'role_assigned', 'user', NEW.user_id::text,
            jsonb_build_object('role', NEW.role));
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.audit_log (user_id, action, target_type, target_id, details)
    values (OLD.user_id, 'role_removed', 'user', OLD.user_id::text,
            jsonb_build_object('role', OLD.role));
    return OLD;
  elsif TG_OP = 'UPDATE' then
    insert into public.audit_log (user_id, action, target_type, target_id, details)
    values (NEW.user_id, 'role_changed', 'user', NEW.user_id::text,
            jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role));
    return NEW;
  end if;
  return null;
end;
$$;

-- Attach trigger to user_roles
create trigger trg_user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function public.log_role_change();
