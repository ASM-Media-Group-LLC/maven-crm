-- Destino REAL (decodificado) del sticker de link de la story, si lo hubo.
-- El scraper de IG devuelve linkUrl envuelto como l.instagram.com/?u=<url-encoded>.
-- Guardamos el destino ya decodificado (ej "piclink.me/leonaoficial") para poder
-- auditar por qué una story se marcó (o no) como promo sin tener que ir a Apify.
-- NULL = la story no tenía sticker de link.
alter table public.promolog_entries add column if not exists story_link_url text;
comment on column public.promolog_entries.story_link_url is
  'Destino decodificado del sticker de link de la story (host+path), para auditar la clasificación de promo. NULL si no había link.';
notify pgrst, 'reload schema';
