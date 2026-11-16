-- Videos de hasta 50 GB por el link de la modelo (Alvaro, 16/11/2026).
-- Juntar las partes de un video grande en el NAS tarda minutos: la edge
-- drive-aporte-nas anota cuándo lo pidió para no pedirlo dos veces mientras
-- el NAS sigue juntando, y lo da por terminado cuando el archivo aparece.
alter table public.drive_aportes add column if not exists nas_juntando_at timestamptz;

comment on column public.drive_aportes.nas_juntando_at is
  'Cuándo se le pidió al NAS juntar las partes (videos grandes). Mientras no pase la espera, no se pide otra vez.';

-- El link de la modelo acepta hasta 50 GB por archivo (antes 10 GB).
update storage.buckets set file_size_limit = 53687091200 where id = 'drive-aportes';
