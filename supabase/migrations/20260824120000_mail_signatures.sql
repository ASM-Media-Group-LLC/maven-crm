-- Firma del correo: el bloque que se agrega solo al final de cada mensaje.
--
-- Una fila por usuario. El HTML lo edita la propia persona (a diferencia del
-- correo de recuperación, que lo carga un admin): es su firma, en sus correos,
-- no hay nada que proteger de sí misma. Por eso la escritura es "self", no
-- admin-only.
--
-- Va en tabla aparte de `profiles` a propósito: profiles es legible por
-- cualquier autenticado, y aunque una firma no es secreta, no hay razón para
-- exponer la de todos ni para mezclar esto con el perfil.

CREATE TABLE IF NOT EXISTS public.mail_signatures (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- HTML de la firma (lo produce el mismo editor del compositor). Vacío = sin
  -- firma configurada.
  html       text NOT NULL DEFAULT '',
  -- Si false, la firma existe pero no se agrega sola (interruptor global).
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mail_signatures ENABLE ROW LEVEL SECURITY;

-- Cada uno ve y edita SOLO la suya. No hay caso de admin: nadie edita la firma
-- de otro.
CREATE POLICY "ver la propia firma"
  ON public.mail_signatures FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "editar la propia firma"
  ON public.mail_signatures FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_signatures TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_mail_signatures()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_mail_signatures ON public.mail_signatures;
CREATE TRIGGER trg_touch_mail_signatures
  BEFORE UPDATE ON public.mail_signatures
  FOR EACH ROW EXECUTE FUNCTION public.touch_mail_signatures();

COMMENT ON TABLE public.mail_signatures IS
  'Firma de correo por usuario (HTML). Se inserta sola al final de los mensajes cuando enabled=true. RLS self: cada uno solo ve y edita la suya.';
