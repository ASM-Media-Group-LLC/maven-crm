-- =============================================================================
-- closer_contact_history: supervisores pueden REGISTRAR contactos en leads de
-- su equipo (no solo en los propios).
-- -----------------------------------------------------------------------------
-- Reporte de Luis Ortega (Team Leader, 2026-07-18): en Closers → Operaciones →
-- Asignaciones (viendo los leads de María), al guardar un "Nuevo contacto" en el
-- popover de seguimiento: "new row violates row-level security policy for table
-- closer_contact_history".
--
-- Causa raíz: asimetría SELECT/INSERT. La policy "Supervisors+ view all contact
-- history" deja a un supervisor VER el historial de cualquier lead (por eso la UI
-- le muestra el form), pero la única policy de INSERT ("Closers insert contact
-- history for own creators") exige closer_creators.assigned_to = auth.uid() → un
-- Team Leader/Closer Supervisor no puede registrar en leads ajenos.
--
-- Fix: policy ADITIVA de INSERT para supervisor_or_above (Team Leader, Closer
-- Supervisor, manager; admin ya tiene ALL). Exige created_by = auth.uid() para
-- que quede auditado QUIÉN registró (el frontend ya lo manda así). A propósito
-- NO usamos has_closer_global_scope() en un WRITE: devuelve true para roles sin
-- NINGUNA fila de Closers (default-abierto), demasiado laxo para escritura.
--
-- Los triggers (max-6, last_contact_date) son SECURITY DEFINER → siguen
-- funcionando igual. Los closers rasos siguen limitados a sus propios leads.
-- =============================================================================

drop policy if exists "Supervisors+ insert contact history" on public.closer_contact_history;
create policy "Supervisors+ insert contact history"
on public.closer_contact_history
for insert
to authenticated
with check (
  public.is_in_role_group(auth.uid(), 'supervisor_or_above')
  and created_by = auth.uid()
);
