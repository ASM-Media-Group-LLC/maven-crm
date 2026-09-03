-- La misma cuenta de OF entraba DOS VECES si BLU mandaba el nombre con otra
-- capitalización (ver 20260905140000, que deduplica y respalda). Los usernames
-- de OnlyFans son únicos SIN distinguir mayúsculas: la identidad de una fila es
-- (cuenta normalizada, día). Acá va el índice que lo impide de raíz y las
-- funciones que escribían con la grafía exacta.
--
-- El nombre GUARDADO no se toca al actualizar: la primera grafía que se vio
-- queda como la de mostrar, porque hay nombres con mayúsculas de verdad
-- ("Vanity VIP 😈💦").
create unique index if not exists creator_daily_earnings_cuenta_dia_uniq
  on public.creator_daily_earnings (lower(trim(blu_creator_name)), date);

create or replace function public.import_blu_earnings(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
      from public.blu_creator_map bm
     where lower(trim(bm.blu_name)) = lower(trim(r->>'blu_name'));
    v_found := found;
    if not v_found then
      v_cid := public.blu_match_creator(r->>'blu_name');
      v_status := null;
    end if;

    insert into public.creator_daily_earnings
      (creator_id, blu_creator_name, date, subscription_gross, tips_gross, message_gross,
       post_gross, referral_gross, stream_gross, total_gross,
       new_sub_gross, recurring_sub_gross, chargebacks_gross, contribution_pct,
       source, imported_by)
    values
      (v_cid, trim(r->>'blu_name'), (r->>'date')::date,
       coalesce((r->>'subscription')::numeric, 0), coalesce((r->>'tips')::numeric, 0),
       coalesce((r->>'message')::numeric, 0), coalesce((r->>'post')::numeric, 0),
       coalesce((r->>'referral')::numeric, 0), coalesce((r->>'stream')::numeric, 0),
       coalesce((r->>'total')::numeric, 0),
       coalesce((r->>'new_sub')::numeric, 0), coalesce((r->>'recurring_sub')::numeric, 0),
       coalesce((r->>'chargebacks')::numeric, 0), coalesce((r->>'contribution_pct')::numeric, 0),
       'blu_export', auth.uid())
    on conflict (lower(trim(blu_creator_name)), date) do update set
      creator_id = coalesce(excluded.creator_id, creator_daily_earnings.creator_id),
      subscription_gross = excluded.subscription_gross, tips_gross = excluded.tips_gross,
      message_gross = excluded.message_gross, post_gross = excluded.post_gross,
      referral_gross = excluded.referral_gross, stream_gross = excluded.stream_gross,
      total_gross = excluded.total_gross,
      new_sub_gross = excluded.new_sub_gross,
      recurring_sub_gross = excluded.recurring_sub_gross,
      chargebacks_gross = excluded.chargebacks_gross,
      contribution_pct = excluded.contribution_pct,
      imported_by = excluded.imported_by, imported_at = now();

    v_total := v_total + 1;
    if v_cid is not null then v_matched := v_matched + 1;
    elsif v_status = 'ignored' then v_ignored := v_ignored + 1;
    elsif not ((r->>'blu_name') = any(v_unmatched)) then
      v_unmatched := array_append(v_unmatched, r->>'blu_name');
    end if;
  end loop;

  v_relink := public.blu_relink_orphans();

  return jsonb_build_object(
    'rows', v_total, 'matched_rows', v_matched, 'ignored_rows', v_ignored,
    'unmatched_names', to_jsonb(v_unmatched),
    'relinked', v_relink);
end;
$$;

-- Los fans, para que caigan en la MISMA fila que la plata.
create or replace function public.import_blu_fans(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r jsonb; v_cid uuid; v_total int := 0; v_matched int := 0;
begin
  if not (public.blu_is_management(auth.uid())
          or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role') then
    raise exception 'forbidden: solo management o el micro (service_role) puede importar fans' using errcode = '42501';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    if coalesce(r->>'blu_name', '') = '' or coalesce(r->>'date', '') = '' then continue; end if;

    select bm.creator_id into v_cid
      from public.blu_creator_map bm
     where lower(trim(bm.blu_name)) = lower(trim(r->>'blu_name'));
    if not found then v_cid := public.blu_match_creator(r->>'blu_name'); end if;

    insert into public.creator_daily_earnings
      (creator_id, blu_creator_name, date, active_fans, new_fans, source, imported_by)
    values
      (v_cid, trim(r->>'blu_name'), (r->>'date')::date,
       nullif(r->>'active_fans','')::int, nullif(r->>'new_fans','')::int,
       'blu_export', auth.uid())
    on conflict (lower(trim(blu_creator_name)), date) do update set
      active_fans = coalesce(excluded.active_fans, creator_daily_earnings.active_fans),
      new_fans    = coalesce(excluded.new_fans,    creator_daily_earnings.new_fans),
      creator_id  = coalesce(excluded.creator_id,  creator_daily_earnings.creator_id),
      imported_at = now();

    v_total := v_total + 1;
    if v_cid is not null then v_matched := v_matched + 1; end if;
  end loop;

  return jsonb_build_object('rows', v_total, 'matched_rows', v_matched);
end;
$$;

-- El re-vinculador: agrupa por cuenta normalizada (primero agrupa y después
-- resuelve la creadora — si no, el coalesce usa una columna fuera del GROUP BY).
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
  if not (public.blu_is_management(auth.uid())
          or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role') then
    raise exception 'forbidden: solo management o el micro (service_role) puede re-vincular ingresos' using errcode = '42501';
  end if;

  for r in
    select x.clave, x.nm,
           coalesce(
             (select bm.creator_id from public.blu_creator_map bm
               where lower(trim(bm.blu_name)) = x.clave and bm.status <> 'ignored'),
             public.blu_match_creator(x.nm)
           ) as cid
    from (
      select lower(trim(e.blu_creator_name)) as clave, min(e.blu_creator_name) as nm
      from public.creator_daily_earnings e
      where e.creator_id is null
        and (p_blu_name is null or lower(trim(e.blu_creator_name)) = lower(trim(p_blu_name)))
        and not exists (
          select 1 from public.blu_creator_map m
          where lower(trim(m.blu_name)) = lower(trim(e.blu_creator_name)) and m.status = 'ignored'
        )
      group by 1
    ) x
  loop
    if r.cid is not null then
      update public.creator_daily_earnings
         set creator_id = r.cid
       where lower(trim(blu_creator_name)) = r.clave and creator_id is null;
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
