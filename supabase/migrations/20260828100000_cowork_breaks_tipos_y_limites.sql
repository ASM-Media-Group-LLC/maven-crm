-- Tipos de pausa y sus limites, y el registro del lado del SERVIDOR.
--
-- Hasta ahora la pausa solo existia en el navegador de quien la tomaba: el
-- reloj arrancaba con un Date.now() del cliente y viajaba por presence. Nada se
-- guardaba, asi que no habia historial, y el tiempo lo reportaba la persona
-- medida. La tabla cowork_breaks se creo justamente para esto y quedo vacia
-- porque nunca se escribieron las acciones que la llenan.
--
-- Los limites van en TABLA, no en el codigo: en este proyecto los umbrales
-- metidos dentro de una funcion ya se perdieron dos veces.

ALTER TABLE public.cowork_breaks
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'bano';

DO $$ BEGIN
  ALTER TABLE public.cowork_breaks
    ADD CONSTRAINT cowork_breaks_kind_chk CHECK (kind IN ('bano', 'break'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.cowork_breaks.kind IS
  'bano = salida corta; break = descanso largo. Cada uno con su limite en cowork_break_limits.';

CREATE TABLE IF NOT EXISTS public.cowork_break_limits (
  kind text PRIMARY KEY CHECK (kind IN ('bano', 'break')),
  label text NOT NULL,
  minutos integer NOT NULL CHECK (minutos > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.cowork_break_limits (kind, label, minutos) VALUES
  ('bano', 'Baño', 10),
  ('break', 'Break', 30)
ON CONFLICT (kind) DO NOTHING;

ALTER TABLE public.cowork_break_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Todos leen los limites" ON public.cowork_break_limits;
CREATE POLICY "Todos leen los limites" ON public.cowork_break_limits FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins cambian los limites" ON public.cowork_break_limits;
CREATE POLICY "Admins cambian los limites" ON public.cowork_break_limits FOR UPDATE TO authenticated
  USING (public.is_in_role_group(auth.uid(), 'admin'))
  WITH CHECK (public.is_in_role_group(auth.uid(), 'admin'));

-- El coordinador tiene que poder ver la pausa EN CURSO de su gente, no solo el
-- historial: es lo que alimenta el contador de la miniatura.
CREATE OR REPLACE FUNCTION public.cowork_pausas_abiertas(_session_id uuid)
RETURNS TABLE (
  user_id uuid, room_id uuid, kind text, started_at timestamptz,
  segundos integer, limite_segundos integer, excedida boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.user_id, b.room_id, b.kind, b.started_at,
         EXTRACT(EPOCH FROM (now() - b.started_at))::integer,
         (l.minutos * 60),
         EXTRACT(EPOCH FROM (now() - b.started_at))::integer > (l.minutos * 60)
  FROM public.cowork_breaks b
  JOIN public.cowork_break_limits l ON l.kind = b.kind
  WHERE b.session_id = _session_id AND b.ended_at IS NULL
    AND (
      public.is_in_role_group(auth.uid(), 'supervisor_or_above')
      OR public.is_cowork_host(auth.uid(), b.session_id)
      OR b.user_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.cowork_pausas_abiertas(uuid) IS
  'Pausas en curso de una sesion, con el tiempo YA CONTADO POR EL SERVIDOR y si se paso del limite. El cliente no puede inflar ni acortar su propio reloj.';
