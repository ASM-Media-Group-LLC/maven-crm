-- Latido del worker de correo por casilla.
--
-- Hasta hoy la única pista de que mail-sync estaba vivo para una casilla era
-- mail_folders.synced_at, que desde #1609 solo se escribe cuando algo CAMBIÓ.
-- El 10/09 eso hizo leer "22 casillas sin barrer hace más de 10 min" donde
-- había casillas quietas. Con esta columna, "¿el worker revisó esta casilla
-- hace poco?" es un SELECT; el worker la escribe como mucho cada LATIDO_MS
-- (5 min): 58 casillas × 12/h, nada.
ALTER TABLE public.mail_credentials
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;

COMMENT ON COLUMN public.mail_credentials.last_sync_at IS
  'Última revisión de la casilla por el worker mail-sync (latido, como mucho cada 5 min). NULL = no la revisó desde que existe la columna.';
