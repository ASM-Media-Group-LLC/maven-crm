-- BITÁCORA MANAGER↔CREADORA (pedido de Jhon 08/09): el filtro "Managers" del
-- Listado debe mostrar las modelos que SON o FUERON de cada manager. Hasta hoy
-- solo existía la foto actual (creators.assigned_manager_profile_id); esta
-- tabla registra cada cambio de asignación de acá en adelante, con un seed de
-- lo que se sabe del pasado.

create table if not exists public.creator_manager_history (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  manager_profile_id uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz
);
create index if not exists idx_cmh_creator on public.creator_manager_history (creator_id);
create index if not exists idx_cmh_manager on public.creator_manager_history (manager_profile_id);

alter table public.creator_manager_history enable row level security;
drop policy if exists cmh_read on public.creator_manager_history;
create policy cmh_read on public.creator_manager_history for select to authenticated using (true);
-- Sin policy de escritura: escribe SOLO el trigger (SECURITY DEFINER).

-- Trigger: cada cambio de assigned_manager_profile_id cierra la fila abierta
-- del manager anterior y abre una del nuevo.
create or replace function public.log_creator_manager_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.assigned_manager_profile_id is not distinct from old.assigned_manager_profile_id then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.assigned_manager_profile_id is not null then
    update creator_manager_history set unassigned_at = now()
    where creator_id = new.id
      and manager_profile_id = old.assigned_manager_profile_id
      and unassigned_at is null;
  end if;
  if new.assigned_manager_profile_id is not null
     and not exists (
       select 1 from creator_manager_history
       where creator_id = new.id
         and manager_profile_id = new.assigned_manager_profile_id
         and unassigned_at is null
     ) then
    insert into creator_manager_history (creator_id, manager_profile_id)
    values (new.id, new.assigned_manager_profile_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_creator_manager_history on public.creators;
create trigger trg_creator_manager_history
  after insert or update of assigned_manager_profile_id on public.creators
  for each row execute function public.log_creator_manager_change();

-- Seed 1: asignaciones ACTUALES como filas abiertas. assigned_at = 2026-07-23,
-- la fecha del backfill #948 (desde entonces rigió la asignación conocida).
insert into public.creator_manager_history (creator_id, manager_profile_id, assigned_at)
select c.id, c.assigned_manager_profile_id, timestamptz '2026-07-23 00:00-05'
from public.creators c
join public.profiles p on p.id = c.assigned_manager_profile_id
where c.assigned_manager_profile_id is not null
  and not exists (
    select 1 from public.creator_manager_history h
    where h.creator_id = c.id and h.manager_profile_id = c.assigned_manager_profile_id
  );

-- Seed 2: "FUERON" de la era de la regla vieja (2026-07-23 → 2026-09-07,
-- Massive=Fabiana dd959846 / Plus=Carolina e3355f39): si el manager actual de
-- una creadora con kash_type difiere del de la regla, la de la regla fue su
-- manager histórica → fila CERRADA.
insert into public.creator_manager_history (creator_id, manager_profile_id, assigned_at, unassigned_at)
select c.id,
       case cb.kash_type
         when 'Massive' then 'dd959846-929b-4b10-a8ba-42c821996e8a'::uuid
         when 'Plus' then 'e3355f39-1d3c-4986-99d1-ee583df9b38c'::uuid
       end,
       timestamptz '2026-07-23 00:00-05',
       timestamptz '2026-09-07 00:00-05'
from public.creators c
join public.creator_business cb on cb.creator_id = c.id
where cb.kash_type in ('Massive', 'Plus')
  and (case cb.kash_type
         when 'Massive' then 'dd959846-929b-4b10-a8ba-42c821996e8a'::uuid
         else 'e3355f39-1d3c-4986-99d1-ee583df9b38c'::uuid
       end) is distinct from c.assigned_manager_profile_id
  and not exists (
    select 1 from public.creator_manager_history h
    where h.creator_id = c.id
      and h.manager_profile_id = (case cb.kash_type
        when 'Massive' then 'dd959846-929b-4b10-a8ba-42c821996e8a'::uuid
        else 'e3355f39-1d3c-4986-99d1-ee583df9b38c'::uuid end)
  );
