-- Habilita subida resumible (TUS) desde el link público de aportes (Alvaro, 06/11).
--
-- Antes: el navegador hacía un PUT único a una signedUrl. Un video de 10+ min
-- (100-300 MB) desde Colombia se cortaba a los 30-40% y reiniciaba desde 0%
-- (Alemia, Bereena y Yoisnia lo intentaron 3 veces y siempre falló).
--
-- Ahora: el navegador sube con TUS (chunks de 6 MB). Supabase Storage expone
-- /storage/v1/upload/resumable, pero requiere auth. Dejamos a `anon` hacer
-- INSERT/UPDATE en el bucket drive-aportes (no SELECT, no DELETE). La edge
-- drive-aporte sigue validando el token y dándole el path convenido; sin
-- "confirmar" no se registra el aporte y el rescatador barre los huérfanos.

drop policy if exists "aportar anon insert" on storage.objects;
create policy "aportar anon insert" on storage.objects
  for insert to anon
  with check (bucket_id = 'drive-aportes');

drop policy if exists "aportar anon update" on storage.objects;
create policy "aportar anon update" on storage.objects
  for update to anon
  using (bucket_id = 'drive-aportes')
  with check (bucket_id = 'drive-aportes');
