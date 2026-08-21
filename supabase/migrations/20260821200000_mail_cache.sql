-- Caché de correo en Postgres.
--
-- POR QUÉ EXISTE: leer el correo "en vivo" contra el proveedor (una sesión
-- IMAP por clic) mostró su techo el 21/08: el proveedor raciona conexiones
-- concurrentes y castiga el comportamiento acumulado — con UN usuario
-- intensivo la cuenta quedó colgada varias veces en un día. Con esta caché,
-- la pantalla lee de acá (instantáneo, para 60 igual que para 5) y el ÚNICO
-- que habla con el proveedor es el sincronizador (infra/mail-sync), con una
-- conexión prolija por casilla — el patrón que el proveedor espera de un
-- cliente de correo normal.
--
-- IDENTIDAD DE LOS MENSAJES: uid + uidvalidity, NO el número de secuencia.
-- El seq cambia cuando se borra un mensaje anterior; el UID es estable
-- dentro de una generación de carpeta (uidvalidity). Si uidvalidity cambia,
-- la carpeta "renació" y hay que resincronizar desde cero.

CREATE TABLE IF NOT EXISTS public.mail_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder       text NOT NULL,
  uid          bigint NOT NULL,
  uidvalidity  bigint NOT NULL,
  message_id   text,
  from_addr    text NOT NULL DEFAULT '',
  to_addr      text NOT NULL DEFAULT '',
  cc_addr      text NOT NULL DEFAULT '',
  subject      text NOT NULL DEFAULT '(sin asunto)',
  date         timestamptz,
  -- Primeras líneas del texto, para la lista (mejora sobre el cliente
  -- en vivo, que no podía permitirse bajar cuerpos para previsualizar).
  snippet      text NOT NULL DEFAULT '',
  -- Cuerpo YA saneado por el sincronizador (misma lista blanca que la edge
  -- function). El frontend igual lo pinta dentro del iframe sandbox: dos
  -- capas, como siempre.
  html         text,
  text_body    text,
  remote_images int NOT NULL DEFAULT 0,
  attachments  jsonb NOT NULL DEFAULT '[]',
  truncated    boolean NOT NULL DEFAULT false,
  unread       boolean NOT NULL DEFAULT true,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, folder, uidvalidity, uid)
);

-- La consulta de la bandeja: por usuario+carpeta, más nuevo primero.
CREATE INDEX IF NOT EXISTS idx_mail_messages_lista
  ON public.mail_messages (user_id, folder, date DESC);

-- Carpetas de cada casilla, mantenidas por el sincronizador. La lista de
-- la UI sale de acá (con conteo de no leídos de regalo).
CREATE TABLE IF NOT EXISTS public.mail_folders (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder      text NOT NULL,
  unread      int NOT NULL DEFAULT 0,
  total       int NOT NULL DEFAULT 0,
  synced_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, folder)
);

-- Hasta dónde sincronizó cada carpeta (para pedir solo lo nuevo:
-- UID FETCH last_uid+1:*).
CREATE TABLE IF NOT EXISTS public.mail_sync_state (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder      text NOT NULL,
  uidvalidity bigint NOT NULL,
  last_uid    bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, folder)
);

ALTER TABLE public.mail_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_folders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_sync_state ENABLE ROW LEVEL SECURITY;

-- Cada quien lee SOLO su correo. Ni los admins ven el correo ajeno: el
-- contenido de un buzón es de su dueño, no de la organización.
CREATE POLICY "leer solo el correo propio"
  ON public.mail_messages FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "leer solo las carpetas propias"
  ON public.mail_folders FOR SELECT
  USING (user_id = auth.uid());

-- El usuario solo puede tocar UNA cosa de sus mensajes: la bandera de
-- leído (apagado optimista del punto azul; el sincronizador y la acción
-- mark_seen se encargan del lado del proveedor).
CREATE POLICY "marcar leido lo propio"
  ON public.mail_messages FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT ON public.mail_messages TO authenticated;
GRANT SELECT ON public.mail_folders  TO authenticated;
-- Column-level: SOLO la bandera. Sin esto podría reescribirse el cuerpo.
GRANT UPDATE (unread) ON public.mail_messages TO authenticated;

-- mail_sync_state es interna del sincronizador: sin GRANT a authenticated.

-- Realtime: la bandeja se actualiza sola cuando el sincronizador inserta.
-- RLS aplica también acá: cada quien recibe eventos solo de sus filas.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.mail_messages;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- ya estaba en la publicación
END $$;

COMMENT ON TABLE public.mail_messages IS
  'Caché del correo por usuario, escrita por infra/mail-sync (service_role). La UI lee de acá — nunca del proveedor en vivo. Cuerpos ya saneados; el iframe sandbox del frontend es la segunda capa.';
COMMENT ON TABLE public.mail_sync_state IS
  'Puntero de sincronización incremental por carpeta (UID). Interna del worker.';
