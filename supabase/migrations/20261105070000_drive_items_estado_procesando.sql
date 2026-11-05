-- Estado "procesando" (Alvaro, 05/11): un aporte por link se muestra en la
-- carpeta APENAS se sube, como "procesándose…", y pasa a "listo" cuando termina
-- de migrar al NAS. A diferencia de "subiendo" (una subida a medias que solo ve
-- su dueño), "procesando" lo ve todo el equipo con acceso a la carpeta.
alter table public.drive_items drop constraint if exists drive_items_estado_check;
alter table public.drive_items add constraint drive_items_estado_check
  check (estado = any (array['subiendo'::text, 'procesando'::text, 'listo'::text]));
