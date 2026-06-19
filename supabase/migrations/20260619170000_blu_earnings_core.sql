-- BLU earnings → Maven, Slice 1 (CORE). Trae el ingreso diario por modelo desde el
-- export de BLU (CRM interno de OF) para Promolog (cruzar promo↔ingreso) + tab Ventas.
-- Path-independent: la misma RPC import_blu_earnings ingesta venga de la subida manual
-- del Excel (hoy) o, a futuro, de un micro/email (mismas filas jsonb). Ver memoria
-- blu_earnings_integration. Data financiera → RLS gateada a management (admin/manager/owner).

-- ── Tablas ──────────────────────────────────────────────────────────────────
create table if not exists public.creator_daily_earnings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '30869615-f579-4981-8a1f-dbebc61eae2d',
  creator_id uuid references public.creators(id) on delete set null,
  blu_creator_name text not null,           -- nombre crudo del export (clave natural + auditoría)
  date date not null,
  subscription_gross numeric(12,2) not null default 0,
  tips_gross numeric(12,2) not null default 0,
  message_gross numeric(12,2) not null default 0,
  post_gross numeric(12,2) not null default 0,
  referral_gross numeric(12,2) not null default 0,
  stream_gross numeric(12,2) not null default 0,
  total_gross numeric(12,2) not null default 0,
  source text not null default 'blu_export',
  imported_by uuid,
  imported_at timestamptz not null default now(),
  unique (blu_creator_name, date)            -- idempotente: re-importar el mismo rango actualiza
);
create index if not exists idx_cde_creator_date on public.creator_daily_earnings (creator_id, date);
create index if not exists idx_cde_date on public.creator_daily_earnings (date);

-- Mapeo persistente nombre-de-BLU → creadora de Maven (la manager lo resuelve 1 vez).
create table if not exists public.blu_creator_map (
  blu_name text primary key,
  creator_id uuid references public.creators(id) on delete cascade,
  status text not null default 'mapped',     -- 'mapped' (creator_id set) | 'ignored' (no es de Maven)
  confirmed_by uuid,
  confirmed_at timestamptz not null default now()
);

-- ── Normalizador + matcher (replica la heurística que dio 45/65 en el spike) ──
create or replace function public.blu_normalize(p text)
returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(lower(coalesce(p, '')), '\m(elite|vip|free|[0-9]+k)\M', ' ', 'g'),
         '[^a-z0-9]', '', 'g');
$$;

create or replace function public.blu_match_creator(p_blu_name text)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select c.id
  from public.creators c
  where public.blu_normalize(p_blu_name) <> ''
    and public.blu_normalize(p_blu_name) in (
      public.blu_normalize(regexp_replace(coalesce(c.onlyfans_url, ''), '^.*onlyfans\.com/', '')),
      public.blu_normalize(c.instagram_handle),
      public.blu_normalize(c.name),
      public.blu_normalize(c.artistic_name)
    )
  limit 1;
$$;

-- ── Gate de management (helper) ───────────────────────────────────────────────
create or replace function public.blu_is_management(p_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_uid and ur.role in ('admin', 'manager', 'owner')
  );
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.creator_daily_earnings enable row level security;
drop policy if exists cde_management on public.creator_daily_earnings;
create policy cde_management on public.creator_daily_earnings for all to authenticated
  using (public.blu_is_management(auth.uid()))
  with check (public.blu_is_management(auth.uid()));

alter table public.blu_creator_map enable row level security;
drop policy if exists bcm_management on public.blu_creator_map;
create policy bcm_management on public.blu_creator_map for all to authenticated
  using (public.blu_is_management(auth.uid()))
  with check (public.blu_is_management(auth.uid()));

-- ── RPC de ingesta (canónica: filas jsonb, venga de Excel/micro/email) ────────
create or replace function public.import_blu_earnings(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r jsonb;
  v_cid uuid;
  v_status text;
  v_found boolean;
  v_total int := 0; v_matched int := 0; v_ignored int := 0;
  v_unmatched text[] := '{}';
begin
  if not public.blu_is_management(auth.uid()) then
    raise exception 'forbidden: solo management puede importar ingresos' using errcode = '42501';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    if coalesce(r->>'blu_name', '') = '' or coalesce(r->>'date', '') = '' then continue; end if;

    select bm.creator_id, bm.status into v_cid, v_status
      from public.blu_creator_map bm where bm.blu_name = (r->>'blu_name');
    v_found := found;
    if not v_found then
      v_cid := public.blu_match_creator(r->>'blu_name');
      v_status := null;
    end if;

    insert into public.creator_daily_earnings
      (creator_id, blu_creator_name, date, subscription_gross, tips_gross, message_gross,
       post_gross, referral_gross, stream_gross, total_gross, source, imported_by)
    values
      (v_cid, r->>'blu_name', (r->>'date')::date,
       coalesce((r->>'subscription')::numeric, 0), coalesce((r->>'tips')::numeric, 0),
       coalesce((r->>'message')::numeric, 0), coalesce((r->>'post')::numeric, 0),
       coalesce((r->>'referral')::numeric, 0), coalesce((r->>'stream')::numeric, 0),
       coalesce((r->>'total')::numeric, 0), 'blu_export', auth.uid())
    on conflict (blu_creator_name, date) do update set
      creator_id = excluded.creator_id,
      subscription_gross = excluded.subscription_gross, tips_gross = excluded.tips_gross,
      message_gross = excluded.message_gross, post_gross = excluded.post_gross,
      referral_gross = excluded.referral_gross, stream_gross = excluded.stream_gross,
      total_gross = excluded.total_gross, imported_by = excluded.imported_by, imported_at = now();

    v_total := v_total + 1;
    if v_cid is not null then v_matched := v_matched + 1;
    elsif v_status = 'ignored' then v_ignored := v_ignored + 1;
    elsif not ((r->>'blu_name') = any(v_unmatched)) then
      v_unmatched := array_append(v_unmatched, r->>'blu_name');
    end if;
  end loop;

  return jsonb_build_object(
    'rows', v_total, 'matched_rows', v_matched, 'ignored_rows', v_ignored,
    'unmatched_names', to_jsonb(v_unmatched));
end;
$$;

-- ── RPC de mapeo manual (las ~20 que no matchean) + backfill de las filas ─────
create or replace function public.blu_set_creator_mapping(p_blu_name text, p_creator_id uuid, p_ignore boolean default false)
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_updated int;
begin
  if not public.blu_is_management(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.blu_creator_map (blu_name, creator_id, status, confirmed_by, confirmed_at)
  values (p_blu_name, case when p_ignore then null else p_creator_id end,
          case when p_ignore then 'ignored' else 'mapped' end, auth.uid(), now())
  on conflict (blu_name) do update set
    creator_id = excluded.creator_id, status = excluded.status,
    confirmed_by = excluded.confirmed_by, confirmed_at = now();

  update public.creator_daily_earnings
    set creator_id = case when p_ignore then null else p_creator_id end
    where blu_creator_name = p_blu_name;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- ── Pendientes de mapeo (para la pantalla): nombres sin creator y sin 'ignored' ──
create or replace function public.blu_pending_mappings()
returns table (blu_name text, dias bigint, total_gross numeric) language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.blu_is_management(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select e.blu_creator_name, count(*)::bigint, sum(e.total_gross)
    from public.creator_daily_earnings e
    where e.creator_id is null
      and not exists (select 1 from public.blu_creator_map m where m.blu_name = e.blu_creator_name and m.status = 'ignored')
    group by e.blu_creator_name
    order by sum(e.total_gross) desc;
end;
$$;

-- ── Grants: management vía frontend (authenticated, el gate interno valida) + el micro futuro ──
revoke all on function public.import_blu_earnings(jsonb) from public, anon;
revoke all on function public.blu_set_creator_mapping(text, uuid, boolean) from public, anon;
revoke all on function public.blu_pending_mappings() from public, anon;
grant execute on function public.import_blu_earnings(jsonb) to authenticated, service_role;
grant execute on function public.blu_set_creator_mapping(text, uuid, boolean) to authenticated, service_role;
grant execute on function public.blu_pending_mappings() to authenticated, service_role;
