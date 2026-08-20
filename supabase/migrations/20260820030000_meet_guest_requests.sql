-- ═══════════════════════════════════════════════════════════════════════════
-- MEET FASE 2: sala de espera para invitados SIN cuenta en Maven
--
-- Copia el modelo "Trusted" de Google Meet, que es el que pidió Jhon:
--   · quien pertenece a la organización (acá: tiene cuenta en Maven) entra directo;
--   · el resto GOLPEA y alguien de adentro lo admite;
--   · dos rechazos y ya no puede volver a pedir (regla de Workspace for Education).
--
-- DECISIÓN DE SEGURIDAD CENTRAL: el token de LiveKit NO se emite al golpear. Se
-- emite recién cuando alguien admite. Si se emitiera antes, el "invitado" ya
-- estaría dentro de la sala y la sala de espera sería decorativa.
--
-- El invitado no tiene cuenta, así que su identidad es un SECRETO que guarda su
-- navegador (guest_token). Con él consulta si lo admitieron y canjea el token de
-- LiveKit. Es una llave, no un identificador: por eso no se puede adivinar ni
-- enumerar, y la tabla no es legible para nadie sin service_role.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.meet_guest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meet_room_id uuid NOT NULL REFERENCES public.meet_rooms(id) ON DELETE CASCADE,
  guest_name text NOT NULL,
  -- Secreto del invitado (lo guarda su navegador). Solo la edge lo resuelve.
  guest_token text NOT NULL UNIQUE,
  -- Hash de la IP con un salt del servidor: alcanza para frenar abuso sin
  -- guardar la dirección en claro.
  ip_hash text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'admitted', 'denied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_meet_guest_requests_room
  ON public.meet_guest_requests(meet_room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meet_guest_requests_pending
  ON public.meet_guest_requests(meet_room_id) WHERE status = 'pending';

ALTER TABLE public.meet_guest_requests ENABLE ROW LEVEL SECURITY;

-- Quien está DENTRO de Maven ve las solicitudes para poder admitir: en Google, a
-- un externo solo lo admite alguien de la organización. Escribir (crear, admitir,
-- rechazar) pasa siempre por las edge functions con service_role, así que no hay
-- policies de INSERT/UPDATE — nadie decide su propia admisión.
CREATE POLICY "Authenticated users see guest requests"
  ON public.meet_guest_requests FOR SELECT TO authenticated
  USING (true);

ALTER TABLE public.meet_guest_requests REPLICA IDENTITY FULL;

COMMENT ON TABLE public.meet_guest_requests IS
  'Sala de espera de Meet: invitados sin cuenta que piden entrar. El token de LiveKit se emite SOLO tras la admisión (ver edge meet-guest).';
COMMENT ON COLUMN public.meet_guest_requests.guest_token IS
  'Secreto que guarda el navegador del invitado para consultar su estado y canjear el token de LiveKit. Es una llave: no se muestra a nadie más.';

-- ─────────────────────────────────────────────────────────────────────────
-- Anti-abuso del endpoint PÚBLICO: sin esto, alguien puede probar códigos de
-- reunión en masa hasta encontrar uno vivo. Registramos cada intento (acertado
-- o no) por hash de IP.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meet_guest_attempts (
  id bigserial PRIMARY KEY,
  ip_hash text NOT NULL,
  ok boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meet_guest_attempts_ip
  ON public.meet_guest_attempts(ip_hash, created_at DESC);

ALTER TABLE public.meet_guest_attempts ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo service_role la toca. Es telemetría de abuso, no dato de usuario.

COMMENT ON TABLE public.meet_guest_attempts IS
  'Intentos de entrada de invitados por hash de IP, para limitar la fuerza bruta de códigos en el endpoint público de Meet. Se purga sola (la edge borra lo de más de un día).';
