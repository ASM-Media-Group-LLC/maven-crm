-- MAVEN YA NO SE CONECTA CON BLU (Alvaro, 11/11/2026: «ya no vamos a tener ninguna conexión con Blu,
-- no nos interesa»; OK expreso para apagar). Las sesiones de Plus y Massive vencieron el 22/10 y no se
-- renuevan. Se apagan el aviso de Blu caído (20261111110000) y la sincronización diaria de chatters
-- (chatter-identidades → chatter-sync → blu-mp). Reversible: el código sigue en el repo.
-- Ya aplicada en producción.
select cron.unschedule(jobid) from cron.job where jobname in ('vigia-blu', 'chatter-identidades');
