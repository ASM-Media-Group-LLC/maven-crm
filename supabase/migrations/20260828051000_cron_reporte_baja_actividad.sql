-- El reporte de baja actividad de Grace pasa a cron determinístico.
--
-- Corre 3 veces por día hábil (10:20, 14:20 y 18:20 Bogotá = 15:20, 19:20 y 23:20 UTC),
-- los mismos horarios que tenían los TRES reminders que reemplaza — eran tres series
-- distintas, por eso los 43 disparos del mes.
--
-- Manda el texto DIRECTO a whatsapp-send: no toca al agente, así que no paga prefijo de
-- prompt (~64.600 tokens, que en este DM se reescribían en caché a 1,25x porque el grupo
-- se usa poco). ~$30/mes → ~$0.
select cron.unschedule('reporte-baja-actividad-grace')
where exists (select 1 from cron.job where jobname = 'reporte-baja-actividad-grace');

select cron.schedule(
  'reporte-baja-actividad-grace',
  '20 15,19,23 * * 1-5',
  $cron$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := jsonb_build_object(
      'group_id', '2f73677e-482b-4e6a-b344-d77498ccceee',
      'body', public.reporte_baja_actividad_texto()
    ),
    timeout_milliseconds := 60000
  );
  $cron$
);

-- Cancelar los tres reminders LLM que hacían esto. Si no, sale duplicado y se sigue
-- pagando lo que veníamos a ahorrar. El reporte de FIN DE SEMANA no se toca.
update public.whatsapp_reminders
   set status = 'cancelled',
       error  = 'Reemplazado por el cron reporte-baja-actividad-grace (determinístico, sin LLM) — 28/08/2026'
 where group_id = '2f73677e-482b-4e6a-b344-d77498ccceee'
   and status in ('pending','scheduled')
   and body ilike 'Reporte de baja actividad para Grace%';
