-- cowork_rooms.preview_mode — cómo renderiza el dashboard del host la miniatura de cada sala:
--   'video'   = mosaico de video en vivo (el host se suscribe subscribe-only a la sala)
--   'avatars' = solo tiles de participantes (nombre/estado), sin abrir stream (modo barato)
-- Configurable por sala desde el lápiz de cada tarjeta. Default 'video'.
alter table public.cowork_rooms
  add column if not exists preview_mode text not null default 'video';

comment on column public.cowork_rooms.preview_mode is
  'video = mosaico de video en vivo en el dashboard del host; avatars = solo tiles de participantes';

notify pgrst, 'reload schema';
