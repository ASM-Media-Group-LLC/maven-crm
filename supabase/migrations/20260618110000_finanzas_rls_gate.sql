-- SEGURIDAD (auditoría de permisos 2026-06-18): las tablas de Finanzas tenían RLS
-- `qual=true` para authenticated → CUALQUIER usuario logueado podía leer (y escribir)
-- por API directa toda la data financiera (comisiones, nómina/sueldos, facturas,
-- pagos, reportes). El menú lo ocultaba, pero la API no estaba gateada.
--
-- Fix: una policy RESTRICTIVE que exige permiso de Finanzas (admin o can_access en
-- el módulo Finanzas) para leer/escribir estas tablas. RESTRICTIVE = se hace AND con
-- las permisivas existentes (no las toca). Transparente en la UI (quien no tiene el
-- módulo ya no lo ve). Las edge functions usan service_role → bypassean RLS, no se
-- afectan.
--
-- NO se incluyen `employees` ni `employee_deductions`: están compartidas con HR /
-- Dashboard / Admin; gatearlas por Finanzas rompería esos módulos. Quedan para una
-- decisión HR-aware aparte.
CREATE OR REPLACE FUNCTION public.has_finanzas_access(_user_id uuid)
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
        AND rp.module = 'Finanzas'
        AND rp.can_access = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_finanzas_access(uuid) TO authenticated, service_role;

-- Gate RESTRICTIVE (AND con lo existente) en las 7 tablas financieras.
DROP POLICY IF EXISTS commissions_finanzas_gate ON public.commissions;
CREATE POLICY commissions_finanzas_gate ON public.commissions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_finanzas_access(auth.uid())) WITH CHECK (public.has_finanzas_access(auth.uid()));

DROP POLICY IF EXISTS invoices_finanzas_gate ON public.invoices;
CREATE POLICY invoices_finanzas_gate ON public.invoices
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_finanzas_access(auth.uid())) WITH CHECK (public.has_finanzas_access(auth.uid()));

DROP POLICY IF EXISTS invoice_templates_finanzas_gate ON public.invoice_templates;
CREATE POLICY invoice_templates_finanzas_gate ON public.invoice_templates
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_finanzas_access(auth.uid())) WITH CHECK (public.has_finanzas_access(auth.uid()));

DROP POLICY IF EXISTS payroll_periods_finanzas_gate ON public.payroll_periods;
CREATE POLICY payroll_periods_finanzas_gate ON public.payroll_periods
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_finanzas_access(auth.uid())) WITH CHECK (public.has_finanzas_access(auth.uid()));

DROP POLICY IF EXISTS payroll_details_finanzas_gate ON public.payroll_details;
CREATE POLICY payroll_details_finanzas_gate ON public.payroll_details
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_finanzas_access(auth.uid())) WITH CHECK (public.has_finanzas_access(auth.uid()));

DROP POLICY IF EXISTS creator_payments_finanzas_gate ON public.creator_payments;
CREATE POLICY creator_payments_finanzas_gate ON public.creator_payments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_finanzas_access(auth.uid())) WITH CHECK (public.has_finanzas_access(auth.uid()));

DROP POLICY IF EXISTS financial_reports_finanzas_gate ON public.financial_reports;
CREATE POLICY financial_reports_finanzas_gate ON public.financial_reports
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_finanzas_access(auth.uid())) WITH CHECK (public.has_finanzas_access(auth.uid()));
