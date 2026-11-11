-- Alvaro (11/11/2026): «no me metas aquí el plan de Claude… no es verdad que
-- solo gasto hago con esto. Quítame Claude». Se apaga (no se borra): deja de
-- sumar en el mes, el año, la proyección y la gráfica.
update public.costos_servicios set activo = false where id = 'claude';
delete from public.costos_mensuales where servicio_id = 'claude';
