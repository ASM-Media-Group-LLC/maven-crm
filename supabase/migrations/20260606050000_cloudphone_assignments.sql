-- cloudphone_assignments — mapea cada cloud phone (Multilogin mobile profile) a un usuario (closer).
-- Overlay liviano: el catálogo de teléfonos vive en Multilogin (el micro cloudphone-gateway lo lista
-- en vivo); esta tabla solo guarda la ASIGNACIÓN + metadata cacheada para pintar tarjetas en Maven.
-- El control de acceso real lo aplica la edge function `cloudphone` (service_role); esta RLS es backstop.

CREATE TABLE IF NOT EXISTS public.cloudphone_assignments (
  profile_id  text PRIMARY KEY,                                   -- Multilogin mobile profile id
  serial_name text,                                               -- nombre visible cacheado (ej "Kash-1")
  remark      text,                                               -- nota cacheada (ej handle de creadora)
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- closer dueño (NULL = sin asignar)
  assigned_by uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cloudphone_assignments ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total.
DROP POLICY IF EXISTS "Admins full access on cloudphone_assignments" ON public.cloudphone_assignments;
CREATE POLICY "Admins full access on cloudphone_assignments"
  ON public.cloudphone_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- El usuario asignado puede VER su propia asignación (backstop; la edge function ya filtra).
DROP POLICY IF EXISTS "Users see own cloudphone assignment" ON public.cloudphone_assignments;
CREATE POLICY "Users see own cloudphone assignment"
  ON public.cloudphone_assignments FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());

CREATE INDEX IF NOT EXISTS idx_cloudphone_assignments_assigned_to
  ON public.cloudphone_assignments (assigned_to);

-- touch updated_at
CREATE OR REPLACE FUNCTION public.touch_cloudphone_assignments_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cloudphone_assignments_updated_at ON public.cloudphone_assignments;
CREATE TRIGGER trg_cloudphone_assignments_updated_at
  BEFORE UPDATE ON public.cloudphone_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_cloudphone_assignments_updated_at();
