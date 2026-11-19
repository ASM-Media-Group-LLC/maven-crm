-- COWORK SOLO EN LA APP: probadores — versión del EDIFICIO.
--
-- En Kash esta migración puso la fecha del 20/11 y tres probadores de Kash (por su
-- uuid). En el edificio solo se agrega la columna, sin probadores ni fecha: cada
-- agencia decide cuándo exige la app. (Reemplazo de al-dia.sh, 19/11/2026.)
alter table public.monitor_config
  add column if not exists cowork_solo_app_probadores uuid[] not null default '{}';

comment on column public.monitor_config.cowork_solo_app_probadores is
  'Cowork solo en la app: a estas personas ya se les pide la app en el navegador del computador, antes de cowork_solo_app_desde.';
