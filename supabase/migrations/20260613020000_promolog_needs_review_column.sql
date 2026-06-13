-- needs_review: la IA marca para revisión manual (confianza baja, o no devolvió un
-- veredicto legible / unreadable). Hasta ahora vivía solo como prefijo de texto
-- "[REVISAR MANUAL]" en notes → imposible filtrar/contar sin ILIKE. Lo promovemos a
-- columna real para una cola de revisión y para el KPI "Sin revisar".
ALTER TABLE public.promolog_entries
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;

-- Backfill: las que ya estaban señaladas en el texto (cubre analyzed + unreadable).
UPDATE public.promolog_entries
  SET needs_review = true
  WHERE needs_review = false AND notes ILIKE '%REVISAR MANUAL%';

NOTIFY pgrst, 'reload schema';
