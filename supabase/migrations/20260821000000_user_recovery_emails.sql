-- Correo personal alternativo, para poder recuperar la cuenta.
--
-- EL PROBLEMA QUE RESUELVE: hoy el link de recuperación y la contraseña
-- temporal del alta se mandan a la dirección con la que la persona entra a
-- Maven. Mientras esa dirección sea Gmail funciona, porque se lee aparte.
-- Cuando el equipo pase a su casilla propia —que SOLO se lee desde adentro
-- de Maven— quien olvide su contraseña no puede recibir el link para
-- recuperarla: queda encerrado afuera. Y lo mismo en el alta, porque la
-- contraseña temporal viaja al buzón al que todavía no puede entrar.
--
-- POR QUÉ NO VA EN `profiles`: esa tabla tiene una política de lectura con
-- condición `true` ("Authenticated users can view all profiles"), así que
-- cualquier empleado logueado lee todas las filas. El correo personal de
-- alguien no puede quedar a la vista de sus 60 compañeros.

CREATE TABLE IF NOT EXISTS public.user_recovery_emails (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  recovery_email text NOT NULL CHECK (recovery_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Para cuando se agregue verificación por código. Hoy siempre NULL: la
  -- dirección la carga un admin en el alta, que es la parte confiable.
  verified_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_recovery_emails ENABLE ROW LEVEL SECURITY;

-- Cada uno ve el suyo (para saber a dónde le va a llegar el link), y los
-- admins ven todos (son los que destraban a alguien que quedó afuera).
CREATE POLICY "ver el propio correo de recuperacion"
  ON public.user_recovery_emails FOR SELECT
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::text));

-- ESCRITURA SOLO ADMIN, a propósito. Si cada uno pudiera cambiar su propia
-- dirección de recuperación sin verificarla, alguien con una sesión robada
-- la apunta a un correo suyo y se queda con la cuenta para siempre: el
-- reset de contraseña deja de ser recuperación y pasa a ser una puerta.
-- Para abrir el autoservicio primero hace falta verificar la dirección con
-- un código; hasta entonces, la carga un admin.
CREATE POLICY "solo admin escribe correos de recuperacion"
  ON public.user_recovery_emails FOR ALL
  USING (has_role(auth.uid(), 'admin'::text))
  WITH CHECK (has_role(auth.uid(), 'admin'::text));

GRANT SELECT ON public.user_recovery_emails TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_recovery_emails TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_user_recovery_emails()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_user_recovery_emails ON public.user_recovery_emails;
CREATE TRIGGER trg_touch_user_recovery_emails
  BEFORE UPDATE ON public.user_recovery_emails
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_recovery_emails();

COMMENT ON TABLE public.user_recovery_emails IS
  'Correo personal (fuera de Maven) al que se mandan la contraseña temporal del alta y los links de recuperación. Sin esto, quien solo tiene casilla interna queda encerrado afuera al olvidar su contraseña. Tabla aparte de profiles porque profiles es legible por cualquier autenticado.';
COMMENT ON COLUMN public.user_recovery_emails.verified_at IS
  'Reservado para verificación por código. Mientras sea NULL en todas las filas, la escritura queda restringida a admins.';

-- Panel del propio usuario: "tu correo de recuperación es este".
CREATE OR REPLACE VIEW public.v_my_recovery_email
WITH (security_invoker = true) AS
SELECT recovery_email, verified_at, updated_at
FROM public.user_recovery_emails
WHERE user_id = auth.uid();

GRANT SELECT ON public.v_my_recovery_email TO authenticated;
