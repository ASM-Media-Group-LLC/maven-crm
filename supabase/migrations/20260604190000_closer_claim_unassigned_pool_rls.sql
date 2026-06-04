-- ─────────────────────────────────────────────────────────────────────
-- Closers: TOMAR (auto-asignarse) un lead del pool sin asignar
-- ─────────────────────────────────────────────────────────────────────
-- Complementa la policy SELECT del pool (20260604180000). Ahora, además de
-- VER los leads sin asignar (stage='Nuevo'), un closer puede RECLAMARLOS
-- para sí desde la pestaña Nuevo/Antiguos.
--
-- Seguridad:
--   · USING (assigned_to IS NULL AND stage='Nuevo') → solo puede tocar
--     filas del POOL sin dueño; nunca un lead ya asignado a otro.
--   · WITH CHECK (assigned_to = auth.uid()) → el resultado del UPDATE debe
--     dejarlo asignado A SÍ MISMO; no puede asignárselo a un tercero ni
--     dejarlo sin dueño. Tampoco puede "robar" un lead ajeno (lo frena el
--     USING). La toma es atómica a nivel fila (dos closers no la duplican:
--     el segundo UPDATE ya no matchea assigned_to IS NULL).
--   · Una vez tomado (assigned_to = él, stage='Asignada'), NO puede
--     devolverlo al pool: la policy de owner exige WITH CHECK assigned_to=él,
--     y esta nueva policy ya no aplica (la fila dejó de estar sin asignar).

DROP POLICY IF EXISTS "Closers can claim unassigned pool" ON public.closer_creators;

CREATE POLICY "Closers can claim unassigned pool"
ON public.closer_creators
FOR UPDATE
TO authenticated
USING (assigned_to IS NULL AND stage = 'Nuevo')
WITH CHECK (assigned_to = auth.uid());
