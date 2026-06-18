-- Paso B del blindaje: gatear las tablas `employees` (cuentas bancarias + sueldos)
-- y `employee_deductions` (deducciones) que tenían RLS qual=true para authenticated.
-- Requiere haberse desplegado ANTES el Paso A (vista employees_directory + lectores
-- amplios repunteados), para no romper Dashboard/Anuncios.
--
-- Gate = admin OR acceso a HR OR acceso a Finanzas. Verificado: no hay lectores
-- no-privilegiados de estas tablas (los amplios usan la vista; HR/Finanzas/Admin
-- pasan el gate). Edge functions (service_role) bypassean RLS.
CREATE OR REPLACE FUNCTION public.has_hr_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_in_role_group(_user_id, 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id
        AND rp.module = 'HR'
        AND rp.can_access = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_hr_access(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS employees_sensitive_gate ON public.employees;
CREATE POLICY employees_sensitive_gate ON public.employees
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_finanzas_access(auth.uid()) OR public.has_hr_access(auth.uid()))
  WITH CHECK (public.has_finanzas_access(auth.uid()) OR public.has_hr_access(auth.uid()));

DROP POLICY IF EXISTS employee_deductions_gate ON public.employee_deductions;
CREATE POLICY employee_deductions_gate ON public.employee_deductions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_finanzas_access(auth.uid()) OR public.has_hr_access(auth.uid()))
  WITH CHECK (public.has_finanzas_access(auth.uid()) OR public.has_hr_access(auth.uid()));
