-- Retención de Storage + tope de archivo del Messenger (decisiones de Jhon 03/09/2026).
--
-- Contexto: el proyecto tenía 10,3 GB en Storage y el reparto era 3,8 GB de
-- creator-files, 2,7 GB de promolog-evidence, 2,4 GB de chat-files (de los
-- cuales 2,1 GB eran basura de cuentas de prueba) y 1 GB de qa-audio. Nada
-- tenía retención: todo crecía para siempre.

-- 1) El Messenger pasa de 350 MB a 1 GB por archivo. OJO: el tope GLOBAL de
--    subida del proyecto (Settings → Storage) es el que manda; si quedara por
--    debajo de 1 GB, Storage responde 413 aunque el bucket diga 1 GB.
update storage.buckets set file_size_limit = 1073741824 where id = 'chat-files';

-- 2) Marca las filas de promolog cuya evidencia se purgó por retención.
--    Apenda la nota en vez de pisarla: puede haber notas escritas por un manager.
create or replace function public.promolog_purgar_evidencia(_creator uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  update promolog_entries
     set evidence_url = null,
         notes = case
                   when notes is null or trim(notes) = '' then 'Evidencia purgada: la creadora dejó de estar activa.'
                   when notes like '%Evidencia purgada%' then notes
                   else notes || E'\n' || 'Evidencia purgada: la creadora dejó de estar activa.'
                 end,
         updated_at = now()
   where creator_id = _creator and evidence_url is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.promolog_purgar_evidencia(uuid) from public;
grant execute on function public.promolog_purgar_evidencia(uuid) to service_role;

-- 3) Cron diario que ejecuta las dos reglas (función `storage-retencion`):
--    · promolog-evidence: se borran las capturas de las creadoras que NO están
--      activas (las filas quedan, marcadas por la función de arriba).
--    · qa-audio: los audios de llamadas se guardan 5 meses.
--    Se re-agenda de forma idempotente.
select cron.unschedule('storage-retencion-diaria')
where exists (select 1 from cron.job where jobname = 'storage-retencion-diaria');

select cron.schedule('storage-retencion-diaria', '25 6 * * *', $CRON$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/storage-retencion',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := jsonb_build_object('limite', 2000),
    timeout_milliseconds := 120000
  );
$CRON$);
