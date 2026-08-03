-- Cron horario: reconciliar whatsapp_members.active contra los participantes
-- reales del gateway (03/08: Lizeth salió de Ventas y Lorena de Managers y sus
-- filas quedaron active=true — el bot las sugería para tareas y los cortes las
-- contaban). Edge whatsapp-members-reconcile + endpoint nuevo del gateway
-- /groups/participants (requiere redeploy del gateway en Dokploy; hasta
-- entonces el edge es no-op limpio). Guardas: solo grupos que el gateway
-- conoce; lista <3 participantes se saltea; reactiva a quien vuelve.
-- (Aplicada en prod vía MCP el 03/08; este archivo la versiona.)
select cron.schedule(
  'whatsapp-members-reconcile',
  '12 * * * *',
  $$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-members-reconcile',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key'),
      'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
  $$
);
