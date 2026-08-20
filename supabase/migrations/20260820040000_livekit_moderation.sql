-- ═══════════════════════════════════════════════════════════════════════════
-- MODERACIÓN DE LLAMADAS: quién puede mutear, echar y terminar
--
-- LO QUE HABÍA: la moderación era HONOR SYSTEM. `muteParticipant` y
-- `removeParticipant` publicaban un mensaje por el canal de datos de LiveKit y
-- el cliente de la víctima se muteaba o se desconectaba solo. Dos consecuencias:
--
--   1. Mutear no tenía NINGUNA validación — el comentario en el código lo decía
--      con todas las letras: "Any participant can mute others".
--   2. Echar validaba al remitente con
--      `senderPermissions?.canPublish && senderPermissions?.canSubscribe`,
--      que es verdadero para CUALQUIER participante normal. O sea, cualquiera
--      podía echar a cualquiera.
--
--   Y sobre todo: quien decidía obedecer era el cliente de la víctima. Con la
--   consola abierta, ignorás el mensaje y te quedás.
--
-- LO QUE HACE ESTA MIGRACIÓN: pone la autorización en la base, en un solo lugar,
-- para que la edge `livekit-moderate` la consulte antes de pedirle a LiveKit que
-- silencie o expulse de verdad (server-side, sin pedirle permiso al cliente).
-- ═══════════════════════════════════════════════════════════════════════════

-- Co-anfitriones de una reunión de Meet (el "grant host controls" de Google).
CREATE TABLE IF NOT EXISTS public.meet_room_cohosts (
  meet_room_id uuid NOT NULL REFERENCES public.meet_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meet_room_id, user_id)
);

ALTER TABLE public.meet_room_cohosts ENABLE ROW LEVEL SECURITY;

-- Lectura para autenticados: la UI necesita saber quién ya es co-anfitrión para
-- no ofrecer "hacer co-anfitrión" dos veces. Escribir pasa por la edge.
CREATE POLICY "Authenticated users see cohosts"
  ON public.meet_room_cohosts FOR SELECT TO authenticated
  USING (true);

ALTER TABLE public.meet_room_cohosts REPLICA IDENTITY FULL;

COMMENT ON TABLE public.meet_room_cohosts IS
  'Co-anfitriones de una reunión de Meet. Como en Google: pueden moderar, pero no pueden echar al anfitrión original (ver can_moderate_livekit_room y la edge livekit-moderate).';

-- ─────────────────────────────────────────────────────────────────────────
-- ¿Puede este usuario moderar ESTA sala de LiveKit?
--
-- Una sola función para los tres tipos de sala que existen, porque el nombre de
-- la sala es lo único que viaja en la petición de moderación:
--   · meet_…      → el creador de la reunión o un co-anfitrión
--   · cowork_…    → un host de esa sesión de Cowork (salas y Hub)
--   · call-…      → quien inició la llamada 1:1
-- Admin de Maven siempre.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_moderate_livekit_room(_user_id uuid, _room text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _user_id IS NULL OR _room IS NULL OR _room = '' THEN
    RETURN false;
  END IF;

  IF public.is_in_role_group(_user_id, 'admin') THEN
    RETURN true;
  END IF;

  IF _room LIKE 'meet\_%' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.meet_rooms mr
      WHERE mr.livekit_room_name = _room
        AND (
          mr.created_by = _user_id
          OR EXISTS (
            SELECT 1 FROM public.meet_room_cohosts c
            WHERE c.meet_room_id = mr.id AND c.user_id = _user_id
          )
        )
    );
  END IF;

  IF _room LIKE 'cowork\_%' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.cowork_sessions s
      JOIN public.cowork_memberships m ON m.session_id = s.id
      WHERE m.user_id = _user_id
        AND m.role = 'host'
        AND (
          s.host_hub_livekit_room = _room
          OR EXISTS (
            SELECT 1 FROM public.cowork_rooms r
            WHERE r.session_id = s.id AND r.livekit_room_name = _room
          )
        )
    );
  END IF;

  IF _room LIKE 'call-%' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.room_id = _room AND c.caller_id = _user_id
    );
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.can_moderate_livekit_room(uuid, text) IS
  'Autorización de moderación por sala de LiveKit (mutear/echar/terminar). La consulta la edge livekit-moderate ANTES de pedirle a LiveKit la acción real. Reemplaza el honor system que corría en el cliente de la víctima.';

GRANT EXECUTE ON FUNCTION public.can_moderate_livekit_room(uuid, text) TO authenticated;

-- ¿Es el anfitrión ORIGINAL de la sala? Un co-anfitrión no puede echarlo, igual
-- que en Google un co-host no puede remover al host.
CREATE OR REPLACE FUNCTION public.is_livekit_room_owner(_user_id uuid, _room text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _user_id IS NULL OR _room IS NULL THEN false
    WHEN _room LIKE 'meet\_%' THEN EXISTS (
      SELECT 1 FROM public.meet_rooms mr
      WHERE mr.livekit_room_name = _room AND mr.created_by = _user_id
    )
    WHEN _room LIKE 'call-%' THEN EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.room_id = _room AND c.caller_id = _user_id
    )
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.is_livekit_room_owner(uuid, text) IS
  'Dueño original de la sala (creador de la reunión / quien inició la llamada). Se usa para que un co-anfitrión no pueda expulsarlo.';

GRANT EXECUTE ON FUNCTION public.is_livekit_room_owner(uuid, text) TO authenticated;
