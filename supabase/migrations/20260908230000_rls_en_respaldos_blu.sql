-- Los tres respaldos que se crearon el 06/09 para la inversión de agencias de BLU
-- (`create table ... as select ...`) nacieron SIN RLS, y con el GRANT por defecto
-- de Supabase eso los dejaba legibles por `anon`, sin sesión: nombres de creadoras,
-- su kash_type, su manager y las etiquetas de las sesiones de BLU.
--
-- Se habilita RLS y NO se crea ninguna policy: son respaldos operativos, los lee
-- service_role/postgres cuando hace falta revertir. Nadie más los necesita.
--
-- ⚠️ LECCIÓN: `create table ... as select` NO hereda RLS. Todo respaldo o tabla
-- nueva creada así queda abierta a anon por el GRANT por defecto de Supabase.
-- Habilitar RLS en el mismo movimiento en que se crea.

alter table public.blu_inversion_respaldo_20260906      enable row level security;
alter table public.blu_session_respaldo_20260906        enable row level security;
alter table public.blu_account_agency_respaldo_20260906 enable row level security;
