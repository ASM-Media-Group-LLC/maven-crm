-- SUPERVISORES ANFITRIONES EN TODOS LOS COWORKS — versión del EDIFICIO.
--
-- En Kash esta migración pasó a cuatro supervisores de Kash (por su uuid) a
-- cowork_anfitriones_en_todas y les dio fila de anfitrión en cada Cowork abierto.
-- Esas personas no existen en el edificio: aquí no se hace nada. Cada agencia del
-- edificio elige a sus anfitriones desde el panel. (Reemplazo de al-dia.sh, 19/11/2026.)
select 1;
