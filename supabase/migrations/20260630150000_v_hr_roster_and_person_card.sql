-- D3 · Ficha de empleado de RRHH apoyada en el roster real (profiles), NO en employees (vacío).
-- v_hr_roster = roster canónico (profile_id, name, role, in_hubstaff, hubstaff_user_id) sobre v_qa_staff.
-- get_hr_person_card(profile_id) = arma TODO el JSON de la ficha (identidad + asistencia + esfuerzo +
--   costo/ROI/scorecard de chatter + closer/llg), gateado a management. El frontend no malabarea llaves.

-- ── Roster canónico ──
create or replace view public.v_hr_roster
with (security_invoker = true) as
select
  s.profile_id,
  s.name,
  s.role,
  s.in_hubstaff,
  (select hm.hubstaff_user_id
     from public.hubstaff_members hm
    where hm.profile_id = s.profile_id and hm.hubstaff_user_id is not null
    order by hm.last_seen_at desc nulls last
    limit 1) as hubstaff_user_id
from public.v_qa_staff s;

grant select on public.v_hr_roster to authenticated;

-- ── Ficha completa por persona ──
create or replace function public.get_hr_person_card(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_mgmt boolean;
  v_name text;
  v_role text;
  v_huid text;
  v_in_hubstaff boolean;
begin
  -- Solo management (mismo gate que las vistas QA). Bypassa RLS pero gateado acá.
  select public.blu_is_management(auth.uid()) into v_is_mgmt;
  if not coalesce(v_is_mgmt, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select r.name, r.role, r.hubstaff_user_id, r.in_hubstaff
    into v_name, v_role, v_huid, v_in_hubstaff
  from public.v_hr_roster r
  where r.profile_id = p_profile_id;

  if v_name is null then
    return null;
  end if;

  return jsonb_build_object(
    'identity', jsonb_build_object(
      'profile_id', p_profile_id,
      'name', v_name,
      'role', v_role,
      'hubstaff_user_id', v_huid,
      'in_hubstaff', v_in_hubstaff
    ),
    -- Asistencia / puntualidad (último período) — por hubstaff_user_id
    'attendance', (
      select to_jsonb(a) from (
        select period, turno, shift_start, dias, checkin_prom_min, tardanzas,
               pct_a_tiempo, min_tarde_prom, horario_cargado
        from public.v_qa_attendance
        where hubstaff_user_id = v_huid
        order by period desc
        limit 1
      ) a
    ),
    -- Esfuerzo genérico (horas/actividad) — por profile_id
    'effort', (
      select to_jsonb(e) from (
        select period, dias, total_hours, avg_activity_pct
        from public.v_qa_effort
        where profile_id = p_profile_id
        order by period desc
        limit 1
      ) e
    ),
    -- Chatter: costo / ROI / ventas (por nombre)
    'chatter', case when v_role = 'Chatter' then (
      select to_jsonb(c) from (
        select period, days_tracked, total_hours, avg_activity_pct, sales, sales_per_hour,
               avg_response_min, unlock_rate, sold_messages, fans_chatted, online_improductivo,
               cost_usd, agency_revenue_usd, margin_usd, roi_x, no_rentable, sin_venta_blu
        from public.v_chatter_hubstaff_effort
        where lower(name) = lower(v_name)
        order by period desc
        limit 1
      ) c
    ) else null end,
    -- Chatter: scorecard (por nombre)
    'scorecard', case when v_role = 'Chatter' then (
      select to_jsonb(s) from (
        select total_sales, fan_conversion_rate, unlock_rate, avg_response_seconds,
               scheduled_hours, clocked_hours, creators_count, sold_messages, fans_chatted,
               snapshot_from, snapshot_to
        from public.chatter_performance
        where lower(name) = lower(v_name)
        order by snapshot_to desc nulls last
        limit 1
      ) s
    ) else null end,
    -- Closer: cierre / monetización (por nombre)
    'closer', case when v_role = 'closer' then (
      select to_jsonb(cl) from (
        select period, dias, total_hours, avg_activity_pct, leads, cerradas,
               monetizacion_usd, usd_por_hora, qa_calls, avg_qa_score, sin_cierres
        from public.v_closer_hubstaff
        where lower(name) = lower(v_name)
        order by period desc
        limit 1
      ) cl
    ) else null end,
    -- LLG: leads (por nombre)
    'llg', case when v_role = 'LLG' then (
      select to_jsonb(l) from (
        select period, dias, total_hours, avg_activity_pct, leads, leads_por_hora
        from public.v_llg_hubstaff
        where lower(name) = lower(v_name)
        order by period desc
        limit 1
      ) l
    ) else null end
  );
end;
$$;

grant execute on function public.get_hr_person_card(uuid) to authenticated;
