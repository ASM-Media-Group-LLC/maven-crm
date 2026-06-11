-- qa_calls: estado del pipeline para que las subidas de QA NUNCA se pierdan.
--
-- Antes la fila se creaba SOLO si la transcripción (ElevenLabs) terminaba OK. Si
-- fallaba o se cortaba el navegador, el audio quedaba en Storage pero NO había
-- fila → el closer perdía la QA sin saberlo (caso real: Miguel 2026-06-11).
--
-- Ahora la fila se crea apenas el audio sube a Storage con status='processing';
-- la transcripción + análisis la completan a 'ready', o la dejan 'failed'
-- (reintentable desde la UI). transcript pasa a nullable porque la fila nace sin él.
alter table public.qa_calls add column if not exists status text not null default 'ready';
alter table public.qa_calls add column if not exists error_message text;
alter table public.qa_calls alter column transcript drop not null;
comment on column public.qa_calls.status is 'processing | ready | failed — pipeline transcripción/análisis';
