-- ═══════════════════════════════════════════════════════════════════════════
-- MEET: reuniones ad-hoc estilo Google Meet
--
-- POR QUÉ UNA TABLA: el panel "Video Rooms" de Messenger guardaba las salas en
-- `useState` — se perdían al recargar la pestaña y no existían para nadie más
-- que el que las creó. El link `/call/room-<timestamp>` funcionaba de casualidad
-- (LiveKit crea la sala al primer join), así que no había forma de listar
-- reuniones, cerrarlas, ni saber quién es el anfitrión.
--
-- QUÉ ES Y QUÉ NO: Meet es una llamada ad-hoc — entro, comparto el link, la
-- gente entra. Cowork es otra cosa: salas paralelas con supervisión, y por eso
-- crear una sesión de Cowork está restringido a supervisor+ mientras que crear
-- un Meet lo puede hacer cualquiera (decisión de Jhon), gateable igual desde
-- Administración → Roles vía can_use_module_function.
--
-- FASE 1 (esta): reuniones para gente CON cuenta en Maven. La sala de espera
-- para invitados externos —lo que en Google es el modo "Trusted": los de la
-- organización entran directo y el resto golpea— es la Fase 2, y necesita un
-- endpoint público con rate limit y una tabla de solicitudes.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.meet_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  livekit_room_name text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  ended_at timestamptz
);

-- Mismo alfabeto que el código de sala de Cowork (sin I/L/O/0/1) para que se
-- pueda dictar por voz. Es una función aparte y no una genérica porque cada una
-- chequea la unicidad contra SU tabla; los dos espacios de códigos son
-- independientes a propósito (un código de Cowork no entra en Meet).
CREATE OR REPLACE FUNCTION public.gen_meet_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
BEGIN
  LOOP
    candidate := '';
    FOR _i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.meet_rooms WHERE code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_meet_rooms_set_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := public.gen_meet_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meet_rooms_set_code ON public.meet_rooms;
CREATE TRIGGER trg_meet_rooms_set_code
  BEFORE INSERT ON public.meet_rooms
  FOR EACH ROW EXECUTE FUNCTION public.tg_meet_rooms_set_code();

CREATE UNIQUE INDEX IF NOT EXISTS uq_meet_rooms_code ON public.meet_rooms(code);
CREATE INDEX IF NOT EXISTS idx_meet_rooms_creator_active
  ON public.meet_rooms(created_by, created_at DESC) WHERE status = 'active';

ALTER TABLE public.meet_rooms ENABLE ROW LEVEL SECURITY;

-- El anfitrión ve y lista sus reuniones. Entrar NO pasa por RLS: el canje del
-- código lo resuelve la edge `meet-room` con service_role, así que quien tiene el
-- código no necesita poder leer la tabla (ni puede enumerarla).
CREATE POLICY "Creator sees own meet rooms"
  ON public.meet_rooms FOR SELECT TO authenticated
  USING (created_by = auth.uid());

COMMENT ON TABLE public.meet_rooms IS
  'Reuniones ad-hoc (Meet). El link y el código son la llave de entrada; la edge meet-room los canjea. Cowork es aparte: salas paralelas con supervisión.';
COMMENT ON COLUMN public.meet_rooms.code IS
  'Código de 6 caracteres para entrar sin link. Alfabeto sin I/L/O/0/1.';
COMMENT ON COLUMN public.meet_rooms.livekit_room_name IS
  'Sala de LiveKit. Prefijo meet_ para distinguirla de las cowork_ (que VideoCallPage trata distinto) y para que livekit-token sepa dónde buscar al anfitrión.';
