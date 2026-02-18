
-- Table for role configuration
CREATE TABLE public.roles_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roles_config ENABLE ROW LEVEL SECURITY;

-- Authenticated can read
CREATE POLICY "Authenticated users can view roles_config"
  ON public.roles_config FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can insert roles_config"
  ON public.roles_config FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles_config"
  ON public.roles_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles_config"
  ON public.roles_config FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_roles_config_updated_at
  BEFORE UPDATE ON public.roles_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Table for granular permissions
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles_config(id) ON DELETE CASCADE,
  module text NOT NULL,
  submodule text,
  can_access boolean NOT NULL DEFAULT true,
  data_scope text NOT NULL DEFAULT 'all',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view role_permissions"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert role_permissions"
  ON public.role_permissions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update role_permissions"
  ON public.role_permissions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete role_permissions"
  ON public.role_permissions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed system roles
INSERT INTO public.roles_config (name, description, is_system) VALUES
  ('admin', 'Acceso completo a todas las funcionalidades y configuraciones del sistema', true),
  ('manager', 'Gestión de equipos, creadores y operaciones del día a día', true),
  ('employee', 'Acceso básico a módulos asignados y tareas propias', true);
