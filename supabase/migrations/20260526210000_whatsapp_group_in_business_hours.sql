-- whatsapp_group_in_business_hours(group_id) — devuelve true si en este
-- momento (hora Bogotá) hay AL MENOS UN miembro linkeado del grupo que
-- está dentro de su turno según whatsapp_user_schedules.
--
-- Usado por whatsapp-ingest para decidir si en modo always-listening
-- debe disparar al agent. Fuera de horario el bot queda mudo (igual que
-- en modo mention). Ahorra costos en bursts nocturnos / fines de semana.
--
-- IMPORTANTE: ignora whatsapp_user_time_off porque si UN miembro se tomó
-- el día pero los demás siguen trabajando, el bot debe seguir activo. La
-- granularidad "no hay nadie hoy" se cubre porque si nadie tiene schedule
-- para ese weekday, no hay rows.

CREATE OR REPLACE FUNCTION public.whatsapp_group_in_business_hours(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.whatsapp_members m
    JOIN public.whatsapp_user_schedules s ON s.user_id = m.user_id
    WHERE m.group_id = p_group_id
      AND m.user_id IS NOT NULL
      -- weekday actual en Bogotá (UTC-5, sin DST). 0=domingo, 6=sábado.
      AND s.weekday = EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Bogota'))::smallint
      -- hora actual en Bogotá entre start_time y end_time
      AND (now() AT TIME ZONE 'America/Bogota')::time BETWEEN s.start_time AND s.end_time
  );
$$;

COMMENT ON FUNCTION public.whatsapp_group_in_business_hours IS
  'True si al menos un miembro linkeado del grupo está actualmente en turno (zona Bogotá). Usado por whatsapp-ingest para gate del modo always-listening.';

GRANT EXECUTE ON FUNCTION public.whatsapp_group_in_business_hours(uuid) TO service_role, authenticated;
