-- Los trabajos programados disparaban todos en el mismo segundo.
--
-- 17/09/2026. Maven se cayó tres veces en la tarde. Medido en
-- cron.job_run_details: cada diez minutos arrancaban CATORCE trabajos a la vez
-- (22:10:03, 21:50:02, 21:20:08, 20:50:00...), los jobids
-- 7,13,17,18,25,33,34,35,63,65,66,69,77,82. Sobre un pozo de 60 conexiones del
-- que PostgREST ya tiene 21, catorce de golpe es material: es exactamente el
-- instante en que se agota el recurso que se agotó.
--
-- Dos cambios, ninguno funcional:
--   1. Los dos más pesados se espacian. Medido con pg_stat_statements:
--      sync_models_recent 8,8% del tiempo de la base (1,03 s de promedio, pico
--      de 1m57s, o sea que se pasaba del límite de 2 min y tiraba el trabajo) y
--      pg_net_watchdog 3,3%. Pasan de cada 5 min a cada 30 y cada 15.
--   2. Los demás se escalonan: misma frecuencia, distinto minuto de arranque.
--
-- Efecto medido en la aplicación justo después, cargando el tablero:
--   antes  44 peticiones, 3.535 ms de promedio, la más lenta 13.349 ms
--   después 73 peticiones,  292 ms de promedio, la más lenta   929 ms
--
-- Para revertir, devolver cada uno a su expresión original:
--   7 -> '*/5 * * * *'    66 -> '*/5 * * * *'
--   17 -> '*/5 * * * *'   34 -> '*/5 * * * *'
--   18 -> '*/10 * * * *'  33 -> '*/10 * * * *'  35 -> '*/10 * * * *'
--   63 -> '*/10 * * * *'  65 -> '*/10 * * * *'  77 -> '*/2 * * * *'
select cron.alter_job(7,  schedule => '*/30 * * * *');
select cron.alter_job(66, schedule => '*/15 * * * *');
select cron.alter_job(17, schedule => '1-59/5 * * * *');
select cron.alter_job(34, schedule => '2-59/5 * * * *');
select cron.alter_job(18, schedule => '3-59/10 * * * *');
select cron.alter_job(33, schedule => '4-59/10 * * * *');
select cron.alter_job(35, schedule => '5-59/10 * * * *');
select cron.alter_job(63, schedule => '6-59/10 * * * *');
select cron.alter_job(65, schedule => '7-59/10 * * * *');
select cron.alter_job(77, schedule => '1-59/2 * * * *');
