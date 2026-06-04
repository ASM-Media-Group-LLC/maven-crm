-- ─────────────────────────────────────────────────────────────────────
-- Closers: visibilidad del POOL de leads SIN asignar (Nuevo / Antiguos)
-- ─────────────────────────────────────────────────────────────────────
-- Problema: un closer (rol por debajo de supervisor) solo podía LEER en
-- closer_creators las filas con assigned_to = él (o created_by = él). El
-- pool de leads nuevos SIN asignar (stage='Nuevo', assigned_to IS NULL)
-- le era invisible → la pestaña "Nuevo" salía vacía y sin contador, aun
-- cuando el frontend ya estaba pensado para mostrarle ese pool (la query
-- de "Nuevo" nunca filtró por assigned_to — confiaba en una visibilidad
-- que RLS no concedía).
--
-- Fix: permitir a CUALQUIER usuario autenticado LEER el pool sin asignar
-- (stage='Nuevo' AND assigned_to IS NULL). De ahí leen las pestañas
-- "Nuevo" (≤30 días) y "Antiguos" (>30 días). Esto NO expone filas
-- asignadas a otros closers — esas siguen cubiertas únicamente por las
-- policies de owner / manager / supervisor+ / admin. Las policies RLS se
-- combinan con OR, así que esta solo SUMA visibilidad del pool, sin tocar
-- las existentes (no repite el leak de la bandeja que cerramos en #350,
-- porque acá lo expuesto es lo SIN dueño, no lo ajeno).

DROP POLICY IF EXISTS "Closers can view unassigned pool" ON public.closer_creators;

CREATE POLICY "Closers can view unassigned pool"
ON public.closer_creators
FOR SELECT
TO authenticated
USING (assigned_to IS NULL AND stage = 'Nuevo');
