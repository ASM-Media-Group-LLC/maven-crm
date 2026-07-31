-- Ya aplicada en prod por MCP (2026-07-31). Este archivo evita el drift repo↔prod.
-- Cola de refresh on-demand del hubstaff-bridge, réplica de blu_sync_requests:
-- la tool get_hubstaff_activity inserta 'pending' y espera corto; el bridge la
-- pollea, corre syncLiveActivities() y marca done. Pedidos >10 min → expired.
create table public.hubstaff_sync_requests (
  id bigint generated always as identity primary key,
  requested_at timestamptz not null default now(),
  requested_by text,
  status text not null default 'pending'
    check (status in ('pending','running','done','error','expired')),
  started_at timestamptz,
  finished_at timestamptz,
  note text
);
alter table public.hubstaff_sync_requests enable row level security;
create index idx_hubstaff_sync_requests_pending
  on public.hubstaff_sync_requests (requested_at) where status = 'pending';

-- Día EN CURSO desde hubstaff_activities (fresca cada LIVE_EVERY_MIN, franjas de
-- 10 min), con identidad resuelta. LEFT JOIN desde hubstaff_members: quien no
-- fichó hoy APARECE con 0 segundos — la ausencia de fila en hubstaff_daily_data
-- era lo que el bot leía como "0h" para gente trabajando. feed_last_ping (global)
-- es la única señal observable de frescura del feed (no hay created_at en
-- hubstaff_activities; hubstaff_config.last_sync_at es luz verde falsa).
create or replace function public.hubstaff_live_today(p_person text default null)
returns table (
  hubstaff_user_id text,
  name text,
  hubstaff_role text,
  full_name_maven text,
  mapped_to_maven boolean,
  seconds_today bigint,
  hours_today numeric,
  first_ping timestamptz,
  last_ping timestamptz,
  activity_pct numeric,
  feed_last_ping timestamptz
)
language sql
security definer
set search_path = public
as $$
  with feed as (
    select max(starts_at) as feed_last from hubstaff_activities
  ),
  today as (
    select a.member_id,
           sum(a.tracked_seconds) as secs,
           min(a.starts_at) as first_ping,
           max(a.starts_at) as last_ping,
           round(sum(a.overall_activity::numeric * a.tracked_seconds) / nullif(sum(a.tracked_seconds), 0), 0) as act
    from hubstaff_activities a
    where a.starts_at >= ((now() at time zone 'America/Bogota')::date::timestamp at time zone 'America/Bogota')
    group by a.member_id
  )
  select m.hubstaff_user_id,
         coalesce(m.name, p.full_name, 'Hubstaff ' || m.hubstaff_user_id) as name,
         m.hubstaff_role,
         p.full_name as full_name_maven,
         (m.profile_id is not null) as mapped_to_maven,
         coalesce(t.secs, 0)::bigint as seconds_today,
         round(coalesce(t.secs, 0)::numeric / 3600, 2) as hours_today,
         t.first_ping,
         t.last_ping,
         t.act as activity_pct,
         (select feed_last from feed) as feed_last_ping
  from hubstaff_members m
  left join profiles p on p.id = m.profile_id
  left join today t on t.member_id = m.id
  where coalesce(m.is_active, true)
    and (p_person is null
      or coalesce(m.name, '') ilike '%' || p_person || '%'
      or coalesce(p.full_name, '') ilike '%' || p_person || '%')
  order by coalesce(t.secs, 0) desc, 2;
$$;

revoke all on function public.hubstaff_live_today(text) from public, anon, authenticated;
grant execute on function public.hubstaff_live_today(text) to service_role;
