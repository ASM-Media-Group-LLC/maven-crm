-- Hubstaff bridge — capa de datos (Slice "core"). El micro `hubstaff-bridge` (Dokploy)
-- jala datos de la API de Hubstaff y los empuja acá vía estos RPCs (con la service_role key).
-- Sigue el patrón de blu-bridge / import_blu_earnings.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Almacén de secretos del token PAT (refresh token ROTA en cada refresh → hay
--    que persistirlo). RLS habilitada y SIN policies → NADIE autenticado lee/escribe;
--    solo la service_role key (que bypassa RLS) lo toca. Singleton id=1.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.hubstaff_secrets (
  id int primary key default 1,
  refresh_token text,
  access_token text,
  access_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint hubstaff_secrets_singleton check (id = 1)
);
alter table public.hubstaff_secrets enable row level security;
-- (intencional: cero policies → inaccesible para anon/authenticated; solo service_role)
insert into public.hubstaff_secrets (id) values (1) on conflict (id) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Relajar hubstaff_members para soportar AUTO-DESCUBRIMIENTO + conciliación.
--    El esquema original exigía profile_id (NOT NULL) → asumía que el mapeo ya existía.
--    El bridge descubre miembros de Hubstaff ANTES de conocer el profile de Maven, así que:
--      - profile_id pasa a NULLABLE (se asigna en la pantalla de conciliación).
--      - se agregan name/email/hubstaff_role/last_seen_at para mostrarlos en esa pantalla.
--      - unique parcial por hubstaff_user_id para que el bridge haga upsert idempotente.
--    HR Monitoring (useHubstaffData) hace left-join a profiles → miembros sin mapear salen
--    como "Sin nombre" pero NO rompen la pantalla.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.hubstaff_members alter column profile_id drop not null;
alter table public.hubstaff_members add column if not exists name text;
alter table public.hubstaff_members add column if not exists email text;
alter table public.hubstaff_members add column if not exists hubstaff_role text;
alter table public.hubstaff_members add column if not exists last_seen_at timestamptz;
create unique index if not exists uq_hubstaff_members_user_id
  on public.hubstaff_members(hubstaff_user_id) where hubstaff_user_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) hubstaff_daily_data — agregado por miembro+día (grano mensual para el scorecard
--    de chatters y dashboards de costo). Separado de hubstaff_activities (grano fino
--    para Monitoreo en vivo). Upsert idempotente por (hubstaff_user_id, date).
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.hubstaff_daily_data (
  id uuid primary key default gen_random_uuid(),
  hubstaff_user_id text not null,
  hubstaff_org_id text,
  date date not null,
  tracked_seconds int not null default 0,
  overall_activity int,        -- % actividad teclado+mouse (0-100)
  project_name text,
  updated_at timestamptz not null default now(),
  unique (hubstaff_user_id, date)
);
create index if not exists idx_hubstaff_daily_user_date on public.hubstaff_daily_data(hubstaff_user_id, date desc);
alter table public.hubstaff_daily_data enable row level security;
-- Lectura solo management (mismo criterio que activities/screenshots tras el lockdown).
drop policy if exists "Management can view hubstaff_daily_data" on public.hubstaff_daily_data;
create policy "Management can view hubstaff_daily_data" on public.hubstaff_daily_data
  for select to authenticated
  using (public.blu_is_management(auth.uid()) or public.has_role(auth.uid(), 'admin'));

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Gate compartido: el bridge llega como service_role (auth.uid()=null), así que el
--    gate debe permitir service_role explícito (por el claim del JWT) O management.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.hubstaff_can_write()
returns boolean language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role'
      or public.blu_is_management(auth.uid());
$$;

-- 5) RPC: upsert del DIRECTORIO de miembros (lo que el bridge descubre por org).
--    No toca profile_id (eso lo fija la conciliación). Inserta nuevos con profile_id null.
create or replace function public.import_hubstaff_members(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; n int := 0;
begin
  if not public.hubstaff_can_write() then
    raise exception 'forbidden: solo service_role/management' using errcode = '42501';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if coalesce(r->>'hubstaff_user_id','') = '' then continue; end if;
    insert into public.hubstaff_members (hubstaff_user_id, hubstaff_org_id, name, email, hubstaff_role, last_seen_at, is_active)
    values (r->>'hubstaff_user_id', r->>'hubstaff_org_id', r->>'name', r->>'email', r->>'hubstaff_role', now(), true)
    on conflict (hubstaff_user_id) where hubstaff_user_id is not null do update set
      hubstaff_org_id = excluded.hubstaff_org_id,
      name = coalesce(excluded.name, public.hubstaff_members.name),
      email = coalesce(excluded.email, public.hubstaff_members.email),
      hubstaff_role = coalesce(excluded.hubstaff_role, public.hubstaff_members.hubstaff_role),
      last_seen_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('upserted', n);
end;
$$;

-- 6) RPC: upsert de la actividad DIARIA agregada (lo que alimenta c1/c4 del scorecard).
create or replace function public.import_hubstaff_data(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; n int := 0;
begin
  if not public.hubstaff_can_write() then
    raise exception 'forbidden: solo service_role/management' using errcode = '42501';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if coalesce(r->>'hubstaff_user_id','') = '' or coalesce(r->>'date','') = '' then continue; end if;
    insert into public.hubstaff_daily_data (hubstaff_user_id, hubstaff_org_id, date, tracked_seconds, overall_activity, project_name, updated_at)
    values (
      r->>'hubstaff_user_id', r->>'hubstaff_org_id', (r->>'date')::date,
      coalesce((r->>'tracked_seconds')::int, 0),
      nullif(r->>'overall_activity','')::int,
      r->>'project_name', now()
    )
    on conflict (hubstaff_user_id, date) do update set
      hubstaff_org_id = excluded.hubstaff_org_id,
      tracked_seconds = excluded.tracked_seconds,
      overall_activity = excluded.overall_activity,
      project_name = excluded.project_name,
      updated_at = now();
    n := n + 1;
  end loop;
  -- marca de última sincronización (config singleton)
  update public.hubstaff_config set last_sync_at = now(), updated_at = now()
   where id = (select id from public.hubstaff_config order by created_at limit 1);
  return jsonb_build_object('upserted', n);
end;
$$;

grant execute on function public.import_hubstaff_members(jsonb) to authenticated, service_role;
grant execute on function public.import_hubstaff_data(jsonb) to authenticated, service_role;
grant execute on function public.hubstaff_can_write() to authenticated, service_role;

notify pgrst, 'reload schema';
