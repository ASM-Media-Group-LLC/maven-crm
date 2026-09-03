-- MIS HORAS DE HUBSTAFF, de la misma fuente que el bot.
--
-- `hubstaff_daily_data` está INCOMPLETA: para Carolina el 31/08 tiene una fila
-- de 3,92 h ("Production PR") cuando el día real fueron 8,48 h. El bot nunca
-- usó esa tabla: `corte_hubstaff_bloque` suma `hubstaff_activities` (los
-- tramos de ~10 min) uniendo por `member_id = hubstaff_members.id`. Con la
-- tabla diaria, el tablero del manager mostraba "Tus horas 3.9" arriba y
-- "Hubstaff 7.5 h" abajo, en la tarjeta que explica su propia nota.
--
-- Se agrega el equivalente personal, con la MISMA aritmética que el bot:
--  · día = fecha en Bogotá (igual que el corte y que promolog);
--  · actividad = promedio PONDERADO por segundos (el promedio simple miente).
--
-- SECURITY DEFINER con filtro duro por `profile_id = auth.uid()`: es personal
-- por construcción. Y agrega en el servidor porque un mes de tramos son ~1.500
-- filas y el corte de 1000 de PostgREST las truncaría en silencio.
create or replace function public.mis_horas_hubstaff(_desde date, _hasta date)
returns table(dia date, horas numeric, actividad integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select (a.starts_at at time zone 'America/Bogota')::date as dia,
         round(sum(a.tracked_seconds) / 3600.0, 2) as horas,
         round(sum(a.overall_activity * a.tracked_seconds) filter (where a.overall_activity is not null)
               / nullif(sum(a.tracked_seconds) filter (where a.overall_activity is not null), 0))::int as actividad
  from public.hubstaff_activities a
  join public.hubstaff_members hm on hm.id = a.member_id
  where hm.profile_id = auth.uid()
    and (a.starts_at at time zone 'America/Bogota')::date between _desde and _hasta
  group by 1
  having sum(a.tracked_seconds) > 0
  order by 1;
$function$;

revoke all on function public.mis_horas_hubstaff(date, date) from public;
grant execute on function public.mis_horas_hubstaff(date, date) to authenticated;
