-- ═══════════════════════════════════════════════════════════════════════════
-- FINALIZAR UNA SESIÓN DE COWORK: QUIÉN PUEDE, Y QUE QUEDE ESCRITO QUIÉN LO HIZO
--
-- CHATTERS KASH se finalizó cuatro veces en cuatro días, cada vez por un host
-- distinto, y nadie sabía quién había sido: la sesión no guardaba quién la
-- apagó y hubo que rastrearlo en los registros del servidor, que se borran en
-- semanas. Además cualquiera de los siete hosts podía apagarla para las 25
-- personas de adentro, y el "enlace de host" convertía en host a quien lo
-- abriera, sin vencimiento.
--
-- Tres cambios, todos en la misma dirección:
--   1. `ended_by`: quién la finalizó, escrito por la edge en el mismo update.
--   2. `host_code_expires_at`: el código de host vence (30 min desde que el
--      creador lo pide). Un link viejo en un chat deja de servir. NULL = nunca
--      emitido: entrar como host exige que el creador lo pida hoy.
--   3. Dos consultas para que la pregunta "¿quién la cerró?" tenga respuesta
--      en la pantalla, no en un log.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.cowork_sessions
  ADD COLUMN IF NOT EXISTS ended_by uuid,
  ADD COLUMN IF NOT EXISTS host_code_expires_at timestamptz;

COMMENT ON COLUMN public.cowork_sessions.ended_by IS
  'Quién finalizó la sesión (auth.users.id). Lo escribe la edge cowork-session en la acción endSession, que solo acepta al creador o a un admin.';
COMMENT ON COLUMN public.cowork_sessions.host_code_expires_at IS
  'Hasta cuándo vale host_invite_code. NULL = nunca emitido. Lo fija getHostCode (30 min) y lo exige joinSession con role=host.';

-- La lista de sesiones activas necesita saber quién la creó: solo esa persona
-- (o un admin) ve el botón de Finalizar; los demás hosts ven Salir.
DROP FUNCTION IF EXISTS public.cowork_mis_sesiones_activas();
CREATE OR REPLACE FUNCTION public.cowork_mis_sesiones_activas()
 RETURNS TABLE(id uuid, name text, description text, role text, members integer, created_at timestamp with time zone, last_room_id uuid, created_by uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH mias AS (
    SELECT m.session_id, m.role
    FROM public.cowork_memberships m
    WHERE m.user_id = auth.uid()
  )
  SELECT
    s.id, s.name, s.description, mias.role,
    (SELECT count(*)::integer FROM public.cowork_memberships t WHERE t.session_id = s.id),
    s.created_at,
    -- La ultima sala donde estuvo, activa o no: es lo que hace que "Volver"
    -- lo devuelva a su puesto en vez de dejarlo esperando una asignacion.
    (SELECT a.room_id FROM public.cowork_room_assignments a
      WHERE a.session_id = s.id AND a.user_id = auth.uid()
      ORDER BY a.assigned_at DESC LIMIT 1),
    s.created_by
  FROM mias
  JOIN public.cowork_sessions s ON s.id = mias.session_id AND s.status = 'active'
  ORDER BY s.created_at DESC;
$function$;

-- Las sesiones en las que estuve y que se finalizaron hace poco, con quién las
-- finalizó. SECURITY INVOKER: respeta las RLS de cada tabla (solo veo las
-- sesiones de las que soy miembro).
CREATE OR REPLACE FUNCTION public.cowork_mis_sesiones_finalizadas(_dias integer DEFAULT 7)
 RETURNS TABLE(id uuid, name text, ended_at timestamp with time zone, ended_by uuid, ended_by_name text, created_by uuid, members integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id, s.name, s.ended_at, s.ended_by,
    p.full_name,
    s.created_by,
    (SELECT count(*)::integer FROM public.cowork_memberships t WHERE t.session_id = s.id)
  FROM public.cowork_memberships m
  JOIN public.cowork_sessions s ON s.id = m.session_id
  LEFT JOIN public.profiles p ON p.id = s.ended_by
  WHERE m.user_id = auth.uid()
    AND s.status = 'ended'
    AND s.ended_at > now() - make_interval(days => GREATEST(1, LEAST(_dias, 90)))
  ORDER BY s.ended_at DESC
  LIMIT 20;
$function$;
