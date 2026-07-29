-- Ingresos de BLU que quedan HUÉRFANOS para siempre (creator_id null) cuando la
-- creadora se carga en Maven DESPUÉS de que su histórico ya se importó.
--
-- CASO REAL (Yoisnia): el histórico ene→abr se importó el 2026-07-22 18:09; la
-- creadora se creó en Maven el 2026-07-22 21:23 — TRES HORAS después. En el momento
-- del insert no había con quién matchear → creator_id null. Los imports siguientes
-- solo re-envían los días recientes (ventana de lookback), y como el upsert re-vincula
-- únicamente las filas que VIENEN en el payload (`on conflict ... set creator_id =
-- excluded.creator_id`), los 117 días viejos nunca se volvieron a tocar:
-- **$19.468 sin atribuir a ninguna manager**, invisibles en todos los reportes.
--
-- Ya existía un backfill, pero SOLO por la vía manual: blu_set_creator_mapping()
-- actualiza las filas del nombre que se mapea a mano. Yoisnia matcheó AUTOMÁTICO
-- (blu_match_creator), así que nunca pasó por esa pantalla y nadie hizo el backfill.
--
-- FIX: función blu_relink_orphans() que re-vincula las huérfanas cuyo nombre YA
-- resuelve, y se la llama al final de cada import → el sistema se auto-sana y no
-- vuelve a depender de que alguien entre a la pantalla de mapeo.
-- Respeta status='ignored' (cj_1324): lo que se decidió ignorar NO se re-vincula.

-- ---------------------------------------------------------------------------
-- 1) blu_relink_orphans — re-vincula huérfanas cuyo nombre ya resuelve
-- ---------------------------------------------------------------------------
create or replace function public.blu_relink_orphans(p_blu_name text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_n int;
  v_rows int := 0;
  v_names text[] := '{}';
begin
  -- Mismo gate que import_blu_earnings: management por el front, o el micro por service_role.
  if not (public.blu_is_management(auth.uid())
          or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role') then
    raise exception 'forbidden: solo management o el micro (service_role) puede re-vincular ingresos' using errcode = '42501';
  end if;

  for r in
    select e.blu_creator_name as nm,
           coalesce(
             -- 1º el mapeo manual confirmado (gana sobre el match por nombre)
             (select bm.creator_id from public.blu_creator_map bm
               where bm.blu_name = e.blu_creator_name and bm.status <> 'ignored'),
             -- 2º el match por nombre normalizado (onlyfans_url / IG / name / artistic_name)
             public.blu_match_creator(e.blu_creator_name)
           ) as cid
    from public.creator_daily_earnings e
    where e.creator_id is null
      and (p_blu_name is null or e.blu_creator_name = p_blu_name)
      -- NUNCA re-vincular un nombre que se marcó 'ignored' a propósito.
      and not exists (
        select 1 from public.blu_creator_map m
        where m.blu_name = e.blu_creator_name and m.status = 'ignored'
      )
    group by e.blu_creator_name
  loop
    if r.cid is not null then
      update public.creator_daily_earnings
         set creator_id = r.cid
       where blu_creator_name = r.nm and creator_id is null;
      get diagnostics v_n = row_count;
      if v_n > 0 then
        v_rows := v_rows + v_n;
        v_names := array_append(v_names, r.nm);
      end if;
    end if;
  end loop;

  return jsonb_build_object('relinked_rows', v_rows, 'relinked_names', to_jsonb(v_names));
end;
$$;

comment on function public.blu_relink_orphans(text) is
  'Re-vincula filas de creator_daily_earnings con creator_id null cuyo blu_creator_name YA resuelve (mapeo manual o blu_match_creator). Respeta status=ignored. La llama import_blu_earnings al final para que el histórico se auto-sane sin re-importarlo.';

revoke all on function public.blu_relink_orphans(text) from public, anon;
grant execute on function public.blu_relink_orphans(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) import_blu_earnings — llama al re-link al final (auto-sanación)
-- ---------------------------------------------------------------------------
-- Idéntica a la versión vigente (20260619180000) salvo las 2 líneas del re-link.
create or replace function public.import_blu_earnings(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r jsonb;
  v_cid uuid;
  v_status text;
  v_found boolean;
  v_total int := 0; v_matched int := 0; v_ignored int := 0;
  v_unmatched text[] := '{}';
  v_relink jsonb;
begin
  if not (public.blu_is_management(auth.uid())
          or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role') then
    raise exception 'forbidden: solo management o el micro (service_role) puede importar ingresos' using errcode = '42501';
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

  -- AUTO-SANACIÓN: el upsert de arriba solo re-vincula las filas que vinieron en ESTE
  -- payload. Las de fuera de la ventana de lookback (histórico importado antes de que
  -- la creadora existiera en Maven) quedarían huérfanas para siempre → las re-vinculamos
  -- acá. Solo toca filas con creator_id null, así que es barato e idempotente.
  v_relink := public.blu_relink_orphans();

  return jsonb_build_object(
    'rows', v_total, 'matched_rows', v_matched, 'ignored_rows', v_ignored,
    'unmatched_names', to_jsonb(v_unmatched),
    'relinked', v_relink);
end;
$$;

revoke all on function public.import_blu_earnings(jsonb) from public, anon;
grant execute on function public.import_blu_earnings(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Backfill de una vez (las huérfanas que YA existen)
-- ---------------------------------------------------------------------------
-- No se llama blu_relink_orphans() acá: la migración corre como owner SIN JWT, y su
-- gate (blu_is_management(auth.uid()) / claim service_role) la rechazaría. Se hace el
-- mismo UPDATE, con la misma exclusión de 'ignored'.
-- Efecto medido antes de aplicar: 140 filas → Yoisnia ($19.468 recuperados);
-- cj_1324 (ignored) y brendaess (no existe en Maven) NO se tocan.
update public.creator_daily_earnings e
set creator_id = src.cid
from (
  select e2.blu_creator_name as nm,
         coalesce(
           (select bm.creator_id from public.blu_creator_map bm
             where bm.blu_name = e2.blu_creator_name and bm.status <> 'ignored'),
           public.blu_match_creator(e2.blu_creator_name)
         ) as cid
  from public.creator_daily_earnings e2
  where e2.creator_id is null
    and not exists (
      select 1 from public.blu_creator_map m
      where m.blu_name = e2.blu_creator_name and m.status = 'ignored'
    )
  group by e2.blu_creator_name
) src
where e.blu_creator_name = src.nm
  and e.creator_id is null
  and src.cid is not null;
