-- Handle/canal de Telegram de la creadora (perfil + chips del popup de Promolog +
-- futura verificación automática de promos en Telegram). URL = https://t.me/<handle>.
-- Sin RLS nueva: la RLS existente de `creators` ya gobierna esta columna.
alter table public.creators
  add column if not exists telegram_handle text;
