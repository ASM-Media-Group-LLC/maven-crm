-- Historial de estados de creadoras + tracking de REINGRESO (caso sunhoney).
--
-- Problemas que resuelve:
--   1. creators se borra con HARD DELETE y los cambios de status no dejan rastro
--      → si una creadora se va y vuelve, Maven no tiene forma de saber que es
--      REINGRESADA (los bots tampoco). La sunhoney vieja no dejó ningún dato.
--   2. La conversión/creación no detecta que el handle ya existió → duplicados
--      ciegos (carolinanovoa22 ×4, wandersloveroficial ×2) en vez de reactivar.
--
-- Piezas:
--   · creator_status_history: 1 fila por cambio de status + snapshot jsonb al
--     borrar (sobrevive al delete; creator_id SIN FK a propósito). Escribe un
--     trigger SECURITY DEFINER; los clientes NO tienen policies de escritura.
--     SELECT solo supervisor_or_above / creators_global_scope (el snapshot
--     lleva PII: phone/email).
--   · creators.rejoined_at / rejoined_from: marca de reingreso legible por bots.
--   · find_creator_history_by_handle(handle): RPC para el chequeo de duplicado/
--     reingreso al crear o convertir (devuelve vivas + borradas, SIN PII).
--   · reactivate_creator(id): RPC quirúrgica para "Reactivar" una creadora
--     terminated/leaving/paused → onboarding + rejoined_at (los closers no
--     tienen UPDATE en creators y NO queremos dárselo entero).
-- Ver [[roles_permission_system]] (has_role tier-aware) + memoria del caso.

-- ── 1. Tabla de historial ────────────────────────────────────────────────────
create table if not exists public.creator_status_history (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null,          -- sin FK: debe sobrevivir al DELETE del creator
  instagram_handle text,
  name text,
  old_status text,
  new_status text not null,          -- 'deleted' cuando se borra la fila
  changed_by uuid,
  changed_at timestamptz not null default now(),
  snapshot jsonb                     -- fila completa (solo en delete) / {'backfill':true}
);

create index if not exists idx_csh_handle on public.creator_status_history (lower(instagram_handle));
create index if not exists idx_csh_creator on public.creator_status_history (creator_id);

alter table public.creator_status_history enable row level security;

drop policy if exists "csh_select_supervisors" on public.creator_status_history;
create policy "csh_select_supervisors" on public.creator_status_history
  for select to authenticated
  using (
    public.is_in_role_group(auth.uid(), 'supervisor_or_above')
    or public.has_creators_global_scope(auth.uid())
  );
-- Sin policies de INSERT/UPDATE/DELETE: solo escribe el trigger (SECURITY DEFINER).

-- ── 2. Trigger: creación, cambio de status y borrado ────────────────────────
create or replace function public.tg_creator_status_history()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.creator_status_history (creator_id, instagram_handle, name, old_status, new_status, changed_by)
    values (new.id, new.instagram_handle, coalesce(nullif(new.artistic_name,''), new.name),
            null, coalesce(new.status, '(null)'), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.creator_status_history (creator_id, instagram_handle, name, old_status, new_status, changed_by)
      values (new.id, new.instagram_handle, coalesce(nullif(new.artistic_name,''), new.name),
              old.status, coalesce(new.status, '(null)'), auth.uid());
    end if;
    return new;
  else -- DELETE
    insert into public.creator_status_history (creator_id, instagram_handle, name, old_status, new_status, changed_by, snapshot)
    values (old.id, old.instagram_handle, coalesce(nullif(old.artistic_name,''), old.name),
            old.status, 'deleted', auth.uid(), to_jsonb(old));
    return old;
  end if;
end $$;

drop trigger if exists trg_creator_status_history on public.creators;
create trigger trg_creator_status_history
  after insert or delete or update of status on public.creators
  for each row execute function public.tg_creator_status_history();

-- ── 3. Backfill: línea base con el estado actual de cada creadora ───────────
insert into public.creator_status_history (creator_id, instagram_handle, name, old_status, new_status, changed_at, snapshot)
select c.id, c.instagram_handle, coalesce(nullif(c.artistic_name,''), c.name),
       null, coalesce(c.status, '(null)'), coalesce(c.created_at, now()),
       jsonb_build_object('backfill', true)
from public.creators c
where not exists (select 1 from public.creator_status_history h where h.creator_id = c.id);

-- ── 4. Marca de reingreso en creators ────────────────────────────────────────
alter table public.creators add column if not exists rejoined_at timestamptz;
alter table public.creators add column if not exists rejoined_from uuid;
comment on column public.creators.rejoined_at is 'Si no es null, la creadora es REINGRESADA (ya había sido creadora antes). Legible por bots.';
comment on column public.creators.rejoined_from is 'creator_id del registro anterior (si se conoce; puede estar borrado — ver creator_status_history).';

-- ── 5. RPC de detección (sin PII) para crear/convertir ───────────────────────
create or replace function public.find_creator_history_by_handle(p_handle text)
returns table(creator_id uuid, name text, status text, source text, last_change timestamptz)
language sql stable security definer
set search_path to 'public'
as $$
  with q as (
    select regexp_replace(lower(trim(coalesce(p_handle,''))), '^@', '') as h
  )
  select c.id, coalesce(nullif(c.artistic_name,''), c.name), c.status, 'creators'::text, c.created_at
  from public.creators c, q
  where q.h <> '' and lower(coalesce(c.instagram_handle,'')) = q.h
  union all
  select s.creator_id, s.name, s.new_status, 'history'::text, s.changed_at
  from public.creator_status_history s, q
  where q.h <> '' and lower(coalesce(s.instagram_handle,'')) = q.h
    and s.new_status = 'deleted'
    and not exists (select 1 from public.creators c2 where c2.id = s.creator_id)
  order by 5 desc
$$;

revoke all on function public.find_creator_history_by_handle(text) from public, anon;
grant execute on function public.find_creator_history_by_handle(text) to authenticated, service_role;

-- ── 6. RPC quirúrgica de reactivación (Reactivar en vez de duplicar) ─────────
create or replace function public.reactivate_creator(p_creator_id uuid, p_closer_responsible uuid default null)
returns table(id uuid, status text, rejoined_at timestamptz)
language plpgsql volatile security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Mismo gate que el INSERT de creators (roles que operan el pipeline).
  if not (public.has_role(auth.uid(), 'closer'::app_role)
          or public.is_in_role_group(auth.uid(), 'supervisor_or_above')
          or public.has_creators_global_scope(auth.uid())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  update public.creators c
     set status = 'onboarding',
         rejoined_at = now(),
         closer_responsible_id = coalesce(p_closer_responsible, auth.uid())
   where c.id = p_creator_id
     and c.status in ('terminated', 'leaving', 'paused')
  returning c.id, c.status, c.rejoined_at;
  -- 0 filas = not_reactivatable (status vivo u id inexistente): el caller decide.
end $$;

revoke all on function public.reactivate_creator(uuid, uuid) from public, anon;
grant execute on function public.reactivate_creator(uuid, uuid) to authenticated, service_role;
