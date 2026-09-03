-- Messenger: estado PERSONALIZADO de texto (estilo Google Chat).
-- Los 4 estados fijos (available/busy/dnd/away) siguen siendo el color del puntito;
-- esto agrega, aparte, una frase libre tipo "10am-2pm / 4pm-8pm | MIA".
--
-- Se persiste en profiles (no solo en Realtime Presence) para que sobreviva a un
-- refresh y se vea también cuando la persona está desconectada. La presencia lo
-- transporta además en vivo para que el cambio se note al instante.
alter table public.profiles
  add column if not exists status_text       text,
  add column if not exists status_expires_at timestamptz;

comment on column public.profiles.status_text is
  'Estado personalizado del Messenger (texto libre, máx 64 en la UI). NULL = sin estado.';
comment on column public.profiles.status_expires_at is
  'Cuándo se limpia solo el status_text. NULL = no expira. Al leer, si ya pasó se trata como vacío.';

-- Lectura/escritura ya cubiertas por las policies existentes de profiles:
--   "Authenticated users can view all profiles" (SELECT) y
--   "Users can update own profile" (UPDATE USING auth.uid() = id).
