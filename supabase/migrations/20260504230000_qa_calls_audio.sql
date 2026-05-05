-- Audio-only intake para QA calls. Contexto: en lugar de aceptar
-- transcripts pegados o subidos como texto (que un closer podría
-- editar a su favor), forzamos a subir el audio crudo. El frontend lo
-- comprime client-side si pesa más de 23MB y lo manda a qa-transcribe
-- (Groq Whisper). Después se persiste el archivo original (o la
-- versión comprimida, que es la única que existe) en Storage para
-- audit trail y playback en el drawer.

-- 1. Columna audio_path en qa_calls.
-- Es path relativo dentro del bucket "qa-audio" — formato:
-- "{tenant_id}/{call_id}.mp3". El bucket es privado, los lectores
-- generan signed URLs en el frontend.
alter table public.qa_calls
  add column if not exists audio_path text;

-- 2. Bucket de Storage para los archivos de audio.
-- public=false porque NO queremos URLs persistentes — todo el acceso
-- pasa por signed URLs generadas con el JWT del user, validadas
-- contra el RLS del qa_calls que apunta a este path.
insert into storage.buckets (id, name, public)
  values ('qa-audio', 'qa-audio', false)
  on conflict (id) do nothing;

-- 3. RLS de Storage scopeado por tenant.
-- Todos los archivos están bajo "{tenant_id}/...", entonces solo
-- vés/escribís archivos cuyo prefijo coincide con tu tenant actual.
-- storage.foldername() parte el path por "/" y devuelve un text[],
-- así que el primer segmento es el tenant_id.
drop policy if exists "qa_audio_tenant_isolated" on storage.objects;
create policy "qa_audio_tenant_isolated"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'qa-audio'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  )
  with check (
    bucket_id = 'qa-audio'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );
