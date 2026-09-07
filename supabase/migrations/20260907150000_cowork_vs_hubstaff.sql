-- Fase 2 del reemplazo de Hubstaff: comparar, en silencio, el reloj de Cowork
-- contra las horas de Hubstaff, por persona y día. Solo admins.
--
-- Hubstaff se lee de `hubstaff_activities` (tramos de ~10 min), NUNCA de
-- `hubstaff_daily_data`, que está incompleta (ver hubstaff_horas_fuente_real).
-- Cowork sale de `cowork_tiempo_diario`, que ya reparte por día de Bogotá.
create or replace function public.admin_cowork_vs_hubstaff(_desde date, _hasta date)
returns table (
  dia date,
  profile_id uuid,
  nombre text,
  hubstaff_seg int,
  hubstaff_actividad int,
  cowork_activo_seg int,
  cowork_pausa_seg int,
  cowork_sin_camara_seg int,
  cowork_sin_pantalla_seg int,
  cowork_fuera_seg int,
  cowork_en_sala_seg int,
  cowork_sesiones int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Solo admins' using errcode = '42501';
  end if;
  if _hasta < _desde or _hasta - _desde > 92 then
    raise exception 'Rango inválido (máximo 92 días)';
  end if;

  return query
  with hub as (
    select (a.starts_at at time zone 'America/Bogota')::date as dia,
           hm.profile_id,
           sum(a.tracked_seconds)::int as seg,
           round(sum(a.overall_activity * a.tracked_seconds) filter (where a.overall_activity is not null)
                 / nullif(sum(a.tracked_seconds) filter (where a.overall_activity is not null), 0))::int as actividad
    from public.hubstaff_activities a
    join public.hubstaff_members hm on hm.id = a.member_id
    where (a.starts_at at time zone 'America/Bogota')::date between _desde and _hasta
    group by 1, 2
    having sum(a.tracked_seconds) > 0
  ),
  cw as (
    select c.dia, c.user_id as profile_id,
           c.seg_activo, c.seg_pausa, c.seg_sin_camara, c.seg_sin_pantalla, c.seg_fuera_de_camara, c.seg_en_sala, c.sesiones
    from public.cowork_tiempo_diario(_desde, _hasta, null, 500, 0) c
  )
  select coalesce(h.dia, c.dia) as dia,
         coalesce(h.profile_id, c.profile_id) as profile_id,
         p.full_name as nombre,
         coalesce(h.seg, 0), h.actividad,
         coalesce(c.seg_activo, 0), coalesce(c.seg_pausa, 0), coalesce(c.seg_sin_camara, 0),
         coalesce(c.seg_sin_pantalla, 0), coalesce(c.seg_fuera_de_camara, 0), coalesce(c.seg_en_sala, 0),
         coalesce(c.sesiones, 0)
  from hub h
  full outer join cw c on c.dia = h.dia and c.profile_id = h.profile_id
  left join public.profiles p on p.id = coalesce(h.profile_id, c.profile_id)
  order by 1 desc, 3;
end;
$$;

revoke all on function public.admin_cowork_vs_hubstaff(date, date) from public, anon;
grant execute on function public.admin_cowork_vs_hubstaff(date, date) to authenticated;
