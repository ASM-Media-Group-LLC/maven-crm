-- Álvaro (03/08, vía Jhon): el Hubstaff va TAMBIÉN en los cortes públicos de
-- cada grupo, no solo en su DM. El RPC gana un parámetro opcional: con
-- p_group_id devuelve solo la línea de ESE grupo (para inyectar al corte);
-- sin argumento sigue devolviendo el bloque completo (copia al DM).
-- (Aplicada en prod vía MCP el 03/08 — misma definición; ver ahí el cuerpo.)
drop function if exists public.corte_hubstaff_bloque();
-- Cuerpo idéntico al de 20260804007000 + parámetro p_group_id (default null) y
-- líneas sin prefijo de grupo cuando se pide un grupo puntual.
