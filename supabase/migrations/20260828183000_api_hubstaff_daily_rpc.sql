-- Horas trabajadas por día (Hubstaff) para la API pública (scope hubstaff:read).
-- Junta hubstaff_daily_data con hubstaff_members (lateral, 1 fila) para traer el
-- nombre del empleado y su profile_id de Maven. Filtros fecha + profile_id.
create or replace function public.api_hubstaff_daily(
  _from date default null,
  _to date default null,
  _profile_id uuid default null,
  _limit int default 100,
  _offset int default 0
)
returns table (
  date date,
  hubstaff_user_id text,
  employee text,
  profile_id uuid,
  tracked_seconds int,
  tracked_hours numeric,
  overall_activity int,
  project_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.date,
         d.hubstaff_user_id,
         m.name as employee,
         m.profile_id,
         d.tracked_seconds,
         round(d.tracked_seconds / 3600.0, 2) as tracked_hours,
         d.overall_activity,
         d.project_name
  from public.hubstaff_daily_data d
  left join lateral (
    select mm.name, mm.profile_id
    from public.hubstaff_members mm
    where mm.hubstaff_user_id = d.hubstaff_user_id
      and mm.hubstaff_org_id = d.hubstaff_org_id
    limit 1
  ) m on true
  where (_from is null or d.date >= _from)
    and (_to is null or d.date <= _to)
    and (_profile_id is null or m.profile_id = _profile_id)
  order by d.date desc, m.name
  limit least(greatest(_limit, 1), 500)
  offset greatest(_offset, 0)
$$;

revoke all on function public.api_hubstaff_daily(date, date, uuid, int, int) from anon, authenticated;
