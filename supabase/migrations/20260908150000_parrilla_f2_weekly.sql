-- Parrilla F2: la semana sale sola (cron jueves 10:00 Bogotá → edge parrilla-weekly:
-- crea + redacta con IA, PDF con Gotenberg, envío al grupo Managers por WhatsApp).

-- 1) Bucket de los PDFs. Público: el gateway de WhatsApp descarga el archivo por URL
--    y las managers abren el enlace desde Maven. Escritura solo service_role (sin
--    policies para anon/authenticated).
insert into storage.buckets (id, name, public)
values ('parrilla-pdfs', 'parrilla-pdfs', true)
on conflict (id) do nothing;

-- 2) Gate del envío automático (mismo patrón que manager_supervisor_live). Apagado →
--    el cron igual crea la parrilla y su PDF, pero no manda nada al grupo.
insert into app_flags (key, enabled, note)
values ('parrilla_weekly_live', true, 'Parrilla F2: el jueves la parrilla nueva se manda sola al grupo Managers. false = solo crea + PDF, sin WhatsApp.')
on conflict (key) do nothing;

-- 3) Secretos del Vault para las edge functions (Gotenberg). SOLO service_role:
--    las edges corren con esa llave; ni anon ni authenticated pueden llamarla.
create or replace function public.internal_secret(p_name text)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;
revoke all on function public.internal_secret(text) from public, anon, authenticated;
grant execute on function public.internal_secret(text) to service_role;

-- 4) Cron: jueves 10:00 Bogotá = 15:00 UTC. Timeout largo: la edge redacta con IA
--    (~30-60 s) + PDF + envío. Re-ejecutarlo no duplica: la edge salta las 'enviada'.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'parrilla-weekly') then
    perform cron.unschedule('parrilla-weekly');
  end if;
end $$;
select cron.schedule(
  'parrilla-weekly',
  '0 15 * * 4',
  $cron$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/parrilla-weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $cron$
);
