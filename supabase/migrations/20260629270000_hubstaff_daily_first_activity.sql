-- c1 (Puntualidad): guardar la hora de la PRIMERA actividad del día por chatter (de las actividades
-- granulares de Hubstaff). Es la base para deducir el turno (8-4/4-12/12-8 en hora Colombia) y puntuar.
alter table public.hubstaff_daily_data add column if not exists first_activity_at timestamptz;

-- import_hubstaff_data ahora también upserta first_activity_at (el bridge lo manda como min(time_slot) del día,
-- agrupado por fecha-Colombia). null → conserva el valor previo (no lo borra si una corrida no lo trajo).
create or replace function public.import_hubstaff_data(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; n int := 0;
begin
  if not public.hubstaff_can_write() then
    raise exception 'forbidden: solo service_role/management' using errcode = '42501';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if coalesce(r->>'hubstaff_user_id','') = '' or coalesce(r->>'date','') = '' then continue; end if;
    insert into public.hubstaff_daily_data (hubstaff_user_id, hubstaff_org_id, date, tracked_seconds, overall_activity, project_name, first_activity_at, updated_at)
    values (
      r->>'hubstaff_user_id', r->>'hubstaff_org_id', (r->>'date')::date,
      coalesce((r->>'tracked_seconds')::int, 0),
      nullif(r->>'overall_activity','')::int,
      r->>'project_name',
      nullif(r->>'first_activity_at','')::timestamptz,
      now()
    )
    on conflict (hubstaff_user_id, date) do update set
      hubstaff_org_id = excluded.hubstaff_org_id,
      tracked_seconds = excluded.tracked_seconds,
      overall_activity = excluded.overall_activity,
      project_name = excluded.project_name,
      first_activity_at = coalesce(excluded.first_activity_at, public.hubstaff_daily_data.first_activity_at),
      updated_at = now();
    n := n + 1;
  end loop;
  update public.hubstaff_config set last_sync_at = now(), updated_at = now()
   where id = (select id from public.hubstaff_config order by created_at limit 1);
  return jsonb_build_object('upserted', n);
end $$;
grant execute on function public.import_hubstaff_data(jsonb) to authenticated, service_role;
