-- Balde público con los instaladores de la app de computador (Mac y Windows).
-- Se lee sin cuenta (la descarga es pública en la portada); solo escribe el CI
-- con la llave de servicio, así que no lleva políticas de escritura.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('descargas', 'descargas', true, 524288000, null)
on conflict (id) do update set public = true, file_size_limit = 524288000;
