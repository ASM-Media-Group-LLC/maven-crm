-- promolog_entries.story_pk — id ESTABLE de la historia en Instagram (reel item pk).
-- Sirve para que un re-run del scan (extensión o lectura directa) NO duplique la fila
-- ni la imagen de una historia ya analizada ese día: el pipeline deduplica por
-- (creator_id, story_pk) dentro de una ventana de ~20h. La columna es opcional
-- (entries manuales / históricas no la tienen).
alter table public.promolog_entries add column if not exists story_pk text;

-- Índice parcial para el lookup de dedup por creadora+historia.
create index if not exists idx_promolog_entries_story_pk
  on public.promolog_entries (creator_id, story_pk)
  where story_pk is not null;
