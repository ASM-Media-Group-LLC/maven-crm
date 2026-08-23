-- Picker de muñequito (Settings > Mi cuenta): el usuario puede "mezclar"
-- variantes de su avatar ilustrado (DiceBear) y guardar la elegida. El seed
-- guardado gana sobre el id como semilla del muñequito; la foto real, si
-- existe, sigue ganando sobre ambos.
alter table public.profiles
  add column if not exists avatar_seed text;
