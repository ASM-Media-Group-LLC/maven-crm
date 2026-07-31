-- promolog_entries.dia — el día CALENDARIO DE BOGOTÁ de cada scan.
--
-- EL BUG (destapado 31/07 por un reporte a Fabiana):
-- `date` es `timestamp WITHOUT time zone` y guarda la hora UTC del scan. Todos los
-- RPCs de reporte bucketean con `e.date::date`, o sea por día UTC. Como Bogotá es
-- UTC-5, TODO scan que corre entre las 19:00 y las 23:59 hora Colombia cae en el día
-- SIGUIENTE.
--
-- Efecto medido sobre los últimos 30 días: 1.799 filas mal fechadas (265 de ellas
-- promos reales). Antes de las 19:00 no hay error; de 19:00 en adelante el error es
-- del 100%. Como el equipo escanea fuerte de noche, "las promos de hoy" venía
-- contaminado con las stories de anoche y el día anterior quedaba sub-contado.
-- Caso concreto: el 31/07 a las 10:38 el bot le listó a Fabiana 5 creadoras que "ya
-- promocionaron hoy" — las 6 filas de IG con date=31/07 se habían escaneado el 30/07
-- entre las 23:19 y las 23:25, y el scan del 31 recién arrancó 11:15.
--
-- POR QUÉ UNA COLUMNA GENERADA Y NO UN UPDATE DE `date`:
-- `date` también lo consumen el estado de scan y los coverage-sweeps, que comparan
-- `(date at time zone 'America/New_York')::date` contra `(now() at time zone
-- 'America/New_York')::date` — auto-consistentes (mismo transform de los dos lados),
-- así que corren bien hoy. Mover el valor guardado los rompería y el sweep
-- re-dispararía scans creyendo que no corrieron. Con una columna nueva, el reporte se
-- arregla y el pipeline de scan no se entera. Además deja de ser una trampa: el
-- próximo RPC que alguien escriba encuentra `dia` a mano y no vuelve a caer en
-- `date::date`.
--
-- Bogotá es UTC-5 FIJO, sin horario de verano, así que la resta constante es exacta
-- todo el año y la expresión es IMMUTABLE (requisito de las columnas generadas).
ALTER TABLE public.promolog_entries
  ADD COLUMN IF NOT EXISTS dia date
  GENERATED ALWAYS AS (((date - interval '5 hours'))::date) STORED;

COMMENT ON COLUMN public.promolog_entries.dia IS
  'Día calendario de Bogotá del scan (UTC-5 fijo). USAR ESTE para agrupar/filtrar por día en reportes. `date` guarda el instante en UTC: date::date da el día UTC y corre de día todo lo escaneado después de las 19:00 hora Colombia.';

COMMENT ON COLUMN public.promolog_entries.date IS
  'Instante del scan en UTC (timestamp naive). NO usar ::date para bucketear por día — usar la columna `dia`. Lo consumen el estado de scan y los coverage-sweeps.';

CREATE INDEX IF NOT EXISTS promolog_entries_dia_idx
  ON public.promolog_entries (dia DESC);

CREATE INDEX IF NOT EXISTS promolog_entries_dia_creator_idx
  ON public.promolog_entries (creator_id, dia DESC);
