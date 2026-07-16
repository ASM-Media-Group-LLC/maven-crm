-- hubstaff_activity_summary — agrega server-side (GROUP BY, evita el techo de 1000 filas)
-- la data de Hubstaff (horas + % actividad ponderado por tiempo) de CUALQUIER persona del
-- equipo, cruzando hubstaff_daily_data × hubstaff_members × profiles. La usa la tool
-- get_hubstaff_activity del catálogo de agentes (Clari).
create or replace function public.hubstaff_activity_summary(
  p_from date, p_to date, p_person text default null
)
returns table (
  hubstaff_user_id text, name text, hubstaff_role text,
  profile_id uuid, mapped_to_maven boolean,
  total_hours numeric, avg_activity_pct numeric, days_worked int, last_day date
)
language sql stable security definer set search_path = public
as $$
  select
    d.hubstaff_user_id,
    coalesce(m.name, p.full_name, 'Hubstaff '||d.hubstaff_user_id) as name,
    m.hubstaff_role,
    m.profile_id,
    (m.profile_id is not null) as mapped_to_maven,
    round(sum(d.tracked_seconds)::numeric/3600, 2) as total_hours,
    round(sum(d.overall_activity::numeric*d.tracked_seconds)/nullif(sum(d.tracked_seconds),0), 0) as avg_activity_pct,
    count(distinct d.date)::int as days_worked,
    max(d.date) as last_day
  from hubstaff_daily_data d
  left join hubstaff_members m on m.hubstaff_user_id = d.hubstaff_user_id
  left join profiles p on p.id = m.profile_id
  where d.date >= p_from and d.date <= p_to
    and (p_person is null
      or coalesce(m.name,'') ilike '%'||p_person||'%'
      or coalesce(p.full_name,'') ilike '%'||p_person||'%')
  group by d.hubstaff_user_id, m.name, p.full_name, m.hubstaff_role, m.profile_id
  order by total_hours desc
$$;

grant execute on function public.hubstaff_activity_summary(date,date,text) to authenticated, service_role;
notify pgrst, 'reload schema';
