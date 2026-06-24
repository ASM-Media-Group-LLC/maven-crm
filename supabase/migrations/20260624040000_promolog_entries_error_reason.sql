-- Motivo técnico legible del error de scan (json_parse, openrouter_timeout, refusal, etc.)
-- para mostrarlo en Promos junto a la fila marcada needs_review. NULL = sin error técnico.
-- OJO: "no subió stories" NO es error (es un "No" legítimo) → no se setea acá; solo en
-- fallas técnicas (la IA no pudo leer la evidencia → insertUnreadableEntry).
alter table public.promolog_entries add column if not exists error_reason text;
comment on column public.promolog_entries.error_reason is
  'Motivo técnico del fallo de scan (solo fallas técnicas: IA ilegible, etc.), para la fila de error en Promos. NULL si no hubo error.';
notify pgrst, 'reload schema';
