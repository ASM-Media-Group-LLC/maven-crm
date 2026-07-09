-- RPCs + cron para promolog-handle-check (chequeo de salud de handles IG).

-- 1) Sospechosas: activas SIN ninguna historia leída en p_days días (persistentemente vacías).
create or replace function public.get_promolog_stale_creators(p_days int default 7)
returns table(creator_id uuid, name text, handle text, days_empty int)
language sql stable security definer set search_path=public as $$
  select c.id, coalesce(nullif(c.artistic_name,''),c.name),
         lower(regexp_replace(coalesce(c.instagram_handle,''),'.*instagram\.com/|[@/ ]','','gi')),
         p_days
  from creators c
  where c.status='active' and nullif(trim(c.instagram_handle),'') is not null
    and not exists (
      select 1 from promolog_entries e
      where e.creator_id=c.id and e.network ilike 'instagram'
        and e.story_count>0 and e.date >= current_date - p_days
    );
$$;
revoke all on function public.get_promolog_stale_creators(int) from public, anon;
grant execute on function public.get_promolog_stale_creators(int) to authenticated, service_role;

-- 2) Upsert del estado con transición roto/resuelto (first_broken_at / resolved_at).
create or replace function public.promolog_upsert_handle_status(
  p_creator_id uuid, p_handle text, p_status text, p_error text, p_days int)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into promolog_handle_status(creator_id, handle, status, ig_error, days_empty, checked_at, first_broken_at)
  values (p_creator_id, p_handle, p_status, p_error, p_days, now(),
          case when p_status='broken' then now() else null end)
  on conflict (creator_id) do update set
    handle = excluded.handle, status = excluded.status, ig_error = excluded.ig_error,
    days_empty = excluded.days_empty, checked_at = now(),
    first_broken_at = case
      when excluded.status='broken' and promolog_handle_status.first_broken_at is null then now()
      when excluded.status <> 'broken' then null
      else promolog_handle_status.first_broken_at end,
    resolved_at = case
      when excluded.status <> 'broken' and promolog_handle_status.status = 'broken' then now()
      when excluded.status = 'broken' then null
      else promolog_handle_status.resolved_at end;
end; $$;
revoke all on function public.promolog_upsert_handle_status(uuid,text,text,text,int) from public, anon;
grant execute on function public.promolog_upsert_handle_status(uuid,text,text,text,int) to service_role;

-- 3) Cron diario 05:00 UTC — chequea las sospechosas y persiste su estado.
select cron.schedule('promolog-handle-check-daily', '0 5 * * *', $cron$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/promolog-handle-check',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 290000
  );
$cron$);

notify pgrst, 'reload schema';
