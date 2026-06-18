-- Paso A del blindaje de `employees` (la tabla expone bank_account_number,
-- base_salary, etc. con RLS qual=true → próximamente se gatea a HR/Finanzas/admin).
-- Para no romper los lectores AMPLIOS (Dashboard general + Anuncios, vistos por
-- TODO el staff) que solo necesitan datos de DIRECTORIO (nombre, depto, status,
-- cumpleaños), creamos una vista con SOLO columnas no sensibles.
--
-- La vista es SECURITY DEFINER (default: corre como su dueño postgres → bypassa la
-- RLS de employees), así que sigue devolviendo el directorio a cualquier
-- authenticated AUNQUE la tabla base quede gateada. NO incluye ninguna columna
-- sensible (sin banco/sueldo/national_id/contacto/dirección/deducciones).
CREATE OR REPLACE VIEW public.employees_directory AS
SELECT
  id, profile_id, employee_code,
  first_name, last_name, profile_photo_url,
  department_id, position_id, reports_to,
  hire_date, termination_date, contract_type, work_modality, status,
  birth_date,            -- para anuncios de cumpleaños (feature de toda la empresa)
  company_id, created_at, updated_at
FROM public.employees;

GRANT SELECT ON public.employees_directory TO authenticated, service_role;
