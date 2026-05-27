-- role_groups: sistema de "capacidades por grupo" para que las policies
-- RLS no dependan del enum app_role (que es estático). Cuando creemos un
-- nuevo rol custom como "Closer Supervisor" / "LLG" / "Chatter Supervisor",
-- basta con agregarlo a esta tabla con los flags apropiados y las policies
-- que usan `is_in_role_group(...)` lo cubren automáticamente.
--
-- Contexto del problema que resuelve:
--   El enum app_role solo contiene admin/manager/employee/supervisor/agent/
--   closer/spammer. Pero user_roles.role es text libre. Cuando alguien
--   creaba un rol nuevo (ej. "Closer Supervisor") las policies escritas
--   con has_role(..., 'supervisor'::app_role) no lo matcheaban, generando
--   bugs raros tipo "duplicate key" en INSERTs que parecían no tener
--   sentido (en realidad RLS ocultaba la row existente).
--
-- Convención de grupos (jerárquicos):
--   is_admin            → admin total, hace todo
--   is_manager_or_above → admin + manager (visión global, casi todo)
--   is_supervisor_or_above → admin + manager + cualquier supervisor
--   is_member           → cualquier usuario válido (closer, llg, etc)

CREATE TABLE IF NOT EXISTS public.role_groups (
  role_name text PRIMARY KEY,
  is_admin boolean NOT NULL DEFAULT false,
  is_manager_or_above boolean NOT NULL DEFAULT false,
  is_supervisor_or_above boolean NOT NULL DEFAULT false,
  is_member boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.role_groups IS
  'Mapea cada user_roles.role (text libre) a grupos de capacidad booleanos. Las policies RLS deben usar is_in_role_group() en vez de has_role() para soportar roles custom automáticamente.';

-- Backfill con los roles que ya existen en el sistema (de DISTINCT role
-- en user_roles + los del enum app_role).
INSERT INTO public.role_groups (role_name, is_admin, is_manager_or_above, is_supervisor_or_above, is_member, description) VALUES
  ('admin', true, true, true, true, 'Acceso total al sistema'),
  ('manager', false, true, true, true, 'Visión global, lectura/escritura amplia'),
  ('supervisor', false, false, true, true, 'Supervisor (enum app_role legacy)'),
  ('Closer Supervisor', false, false, true, true, 'Supervisor del área de closers'),
  ('Chatter Supervisor', false, false, true, true, 'Supervisor del área de chatters'),
  ('coordinator_beta', false, false, true, true, 'Coordinador beta (similar a supervisor)'),
  ('closer', false, false, false, true, 'Closer individual'),
  ('LLG', false, false, false, true, 'Lead Generator'),
  ('chatter', false, false, false, true, 'Chatter / agente de chat'),
  ('agent', false, false, false, true, 'Agente genérico'),
  ('employee', false, false, false, true, 'Empleado genérico'),
  ('spammer', false, false, false, true, 'Operador de cuentas IG de scrapeo')
ON CONFLICT (role_name) DO NOTHING;

-- Función helper que la usaremos en las policies RLS de aquí en adelante.
-- SECURITY DEFINER + STABLE para que postgres pueda optimizarla.
CREATE OR REPLACE FUNCTION public.is_in_role_group(_user_id uuid, _group text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_groups rg ON rg.role_name = ur.role
    WHERE ur.user_id = _user_id
      AND CASE _group
        WHEN 'admin'               THEN rg.is_admin
        WHEN 'manager_or_above'    THEN rg.is_manager_or_above
        WHEN 'supervisor_or_above' THEN rg.is_supervisor_or_above
        WHEN 'member'              THEN rg.is_member
        ELSE false
      END
  );
$$;

COMMENT ON FUNCTION public.is_in_role_group(uuid, text) IS
  'Para RLS: chequea si user_id tiene un rol asignado en user_roles que esté marcado en role_groups con la capacidad solicitada. Reemplaza has_role(..., enum) para soportar roles custom.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_role_groups_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_role_groups_updated_at
  BEFORE UPDATE ON public.role_groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_role_groups_updated_at();

-- Trigger sobre user_roles: si insertan/actualizan a un role que NO
-- está en role_groups, log un WARNING (no bloqueamos para no romper
-- flows existentes, pero queda visible en logs).
CREATE OR REPLACE FUNCTION public.tg_user_roles_check_role_group()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.role_groups WHERE role_name = NEW.role) THEN
    RAISE WARNING 'role "%" no está registrado en public.role_groups — las RLS policies que usan is_in_role_group() no lo cubrirán. Agregalo a role_groups con los flags apropiados.', NEW.role;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_user_roles_check_role_group
  AFTER INSERT OR UPDATE OF role ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_user_roles_check_role_group();

-- RLS: tabla role_groups la pueden leer todos los authenticated, pero
-- solo admin la puede modificar.
ALTER TABLE public.role_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read role_groups"
ON public.role_groups FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Only admins can modify role_groups"
ON public.role_groups FOR ALL
TO authenticated
USING (public.is_in_role_group(auth.uid(), 'admin'))
WITH CHECK (public.is_in_role_group(auth.uid(), 'admin'));

-- ─────────────────────────────────────────────────────────────────────
-- Migración de las policies de closer_creators a usar is_in_role_group.
-- Reemplazamos las policies "Supervisors can ..." (que usaban el enum)
-- + las recién creadas "Closer Supervisors ..." por policies más
-- generales basadas en role_groups.
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Supervisors can view all closer_creators" ON public.closer_creators;
DROP POLICY IF EXISTS "Supervisors can update closer_creators" ON public.closer_creators;
DROP POLICY IF EXISTS "Closer Supervisors view all closer_creators" ON public.closer_creators;
DROP POLICY IF EXISTS "Closer Supervisors update closer_creators" ON public.closer_creators;
DROP POLICY IF EXISTS "Managers can view all closer_creators" ON public.closer_creators;
DROP POLICY IF EXISTS "Managers can update closer_creators" ON public.closer_creators;

CREATE POLICY "Supervisors+ view all closer_creators"
ON public.closer_creators FOR SELECT
USING (public.is_in_role_group(auth.uid(), 'supervisor_or_above'));

CREATE POLICY "Supervisors+ update closer_creators"
ON public.closer_creators FOR UPDATE
USING (public.is_in_role_group(auth.uid(), 'supervisor_or_above'))
WITH CHECK (public.is_in_role_group(auth.uid(), 'supervisor_or_above'));
