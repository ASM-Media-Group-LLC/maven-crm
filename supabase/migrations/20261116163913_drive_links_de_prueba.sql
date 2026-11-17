-- Links de PRUEBA (Alvaro, 16/11/2026): lo que se sube con ellos aterriza en el
-- Drive como siempre, pero no le avisa a nadie (ni correo ni campana). Para
-- probar subidas grandes sin mandar avisos reales.
alter table public.drive_upload_links add column if not exists prueba boolean not null default false;

comment on column public.drive_upload_links.prueba is
  'Link de prueba: lo subido no dispara correo ni campana (drive-aporte-nas).';

-- El link de la creadora «Test» (carpeta TEST CONTENIDO) es el de prueba.
update public.drive_upload_links set prueba = true
 where item_id in (select id from public.drive_items where nombre = 'TEST CONTENIDO' and tipo = 'carpeta');
