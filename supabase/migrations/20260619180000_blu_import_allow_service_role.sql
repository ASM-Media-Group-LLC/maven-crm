-- El micro blu-bridge ingesta vía service_role → auth.uid() es null → el gate de
-- import_blu_earnings (blu_is_management) lo bloqueaba. Permitimos también service_role
-- (que de todas formas bypassa RLS). Sigue bloqueado para anon/authenticated no-management,
-- y para llamadas sin JWT (ej. el SQL editor por MCP) el claim 'role' no está → bloqueado.
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

  return jsonb_build_object(
    'rows', v_total, 'matched_rows', v_matched, 'ignored_rows', v_ignored,
    'unmatched_names', to_jsonb(v_unmatched));
end;
$$;
