-- Bucket público para las fotos de perfil de la gente del equipo.
--
-- POR QUÉ HACÍA FALTA: la subida de "Mi cuenta" guardaba la foto en
-- `creator-files`, que es PRIVADO (4490 objetos de creadoras), y después
-- guardaba en `profiles.avatar_url` el resultado de `getPublicUrl()`.
--
-- Ese método NO comprueba nada: arma la URL pública del bucket exista o no
-- exista el permiso. Sobre un bucket privado devuelve una URL que responde 400.
-- Entonces la subida funcionaba, la fila se guardaba, el aviso decía "Foto de
-- perfil actualizada"… y la imagen no cargaba nunca. El avatar caía a las
-- iniciales y desde afuera parecía que no se había guardado nada.
--
-- La app ya tenía el patrón correcto: `creator-avatars` y `scouter-avatars` son
-- buckets públicos dedicados. Faltaba el de las personas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-avatars', 'user-avatars', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/gif','image/avif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lectura pública: es lo que hace que el <img> del avatar funcione sin sesión,
-- igual que en los otros dos buckets de avatares.
drop policy if exists "user_avatars_lectura_publica" on storage.objects;
create policy "user_avatars_lectura_publica"
  on storage.objects for select
  using (bucket_id = 'user-avatars');

-- Escritura: SOLO en la carpeta propia.
--
-- Más estricto que `scouter-avatars`, que deja a cualquier autenticado escribir
-- en todo el bucket. Acá la ruta es `<uid>/<archivo>`, así que nadie puede
-- pisarle la foto a otra persona.
drop policy if exists "user_avatars_escribo_lo_mio" on storage.objects;
create policy "user_avatars_escribo_lo_mio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user_avatars_reemplazo_lo_mio" on storage.objects;
create policy "user_avatars_reemplazo_lo_mio"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user_avatars_borro_lo_mio" on storage.objects;
create policy "user_avatars_borro_lo_mio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── La misma trampa, en la foto de la CREADORA ──────────────────────────────
--
-- El panel la sube también a `creator-files` (privado) y guarda su URL
-- "pública". Ya existe `creator-avatars`, público, pero SIN ninguna política:
-- hasta ahora solo escribía el edge `creator-avatar-fetch` con service_role,
-- así que una subida desde el navegador fallaría.
--
-- La regla no se inventa: es EXACTAMENTE la misma que decide quién puede
-- actualizar la fila de la creadora (política "Managers and admins can update
-- creators"). Quien puede editarla puede cambiarle la foto; nadie más.
drop policy if exists "creator_avatars_escriben_quienes_editan_creadoras" on storage.objects;
create policy "creator_avatars_escriben_quienes_editan_creadoras"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'creator-avatars'
    and (
      has_role(auth.uid(), 'admin'::app_role)
      or has_role(auth.uid(), 'manager'::app_role)
      or has_creators_global_scope(auth.uid())
      or is_in_role_group(auth.uid(), 'supervisor_or_above'::text)
    )
  );

drop policy if exists "creator_avatars_reemplazan_quienes_editan_creadoras" on storage.objects;
create policy "creator_avatars_reemplazan_quienes_editan_creadoras"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'creator-avatars'
    and (
      has_role(auth.uid(), 'admin'::app_role)
      or has_role(auth.uid(), 'manager'::app_role)
      or has_creators_global_scope(auth.uid())
      or is_in_role_group(auth.uid(), 'supervisor_or_above'::text)
    )
  );

drop policy if exists "creator_avatars_lectura_publica" on storage.objects;
create policy "creator_avatars_lectura_publica"
  on storage.objects for select
  using (bucket_id = 'creator-avatars');
