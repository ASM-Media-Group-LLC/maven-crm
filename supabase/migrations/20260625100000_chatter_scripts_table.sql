-- Frases hechas ("scripts") para el composer del Chatter Evaluator. Compartidas por el equipo
-- (todos los evaluadores ven/usan las mismas; cualquiera agrega/edita/borra). Cada script:
-- send_on_click=true → al click se MANDA solo; false → al click se INSERTA en el cajón sin enviar.
create table if not exists public.chatter_scripts (
  id uuid primary key default gen_random_uuid(),
  label text,                         -- nombre corto opcional para buscar/identificar
  text text not null,                 -- la frase que se manda/inserta
  send_on_click boolean not null default false,
  sort_order int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chatter_scripts enable row level security;

drop policy if exists chatter_scripts_select on public.chatter_scripts;
create policy chatter_scripts_select on public.chatter_scripts
  for select to authenticated using (true);

drop policy if exists chatter_scripts_insert on public.chatter_scripts;
create policy chatter_scripts_insert on public.chatter_scripts
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists chatter_scripts_update on public.chatter_scripts;
create policy chatter_scripts_update on public.chatter_scripts
  for update to authenticated using (true) with check (true);

drop policy if exists chatter_scripts_delete on public.chatter_scripts;
create policy chatter_scripts_delete on public.chatter_scripts
  for delete to authenticated using (true);

grant select, insert, update, delete on public.chatter_scripts to authenticated;
