-- =============================================================================
-- Closers QA: el correo del reporte ya no se pierde si el closer cierra la pestaña.
-- -----------------------------------------------------------------------------
-- Reporte de Jhon (2026-07-29): se subió una QA y no llegó el correo, aunque el
-- fix del 401 (#961) ya estaba deployado.
--
-- CAUSA RAÍZ (distinta a la del 401): el correo se manda DENTRO de la misma
-- invocación HTTP de qa-analyze que dispara el navegador. Si el closer cierra la
-- pestaña (o se corta la red) cuando el análisis ya se guardó pero el correo
-- todavía no salió, Supabase cancela el worker → el análisis queda (claude_score
-- poblado) y el correo NO sale. Evidencia del caso real: la QA del 29-jul quedó
-- con status='processing' (ese 'ready' lo escribe el FRONTEND al final de su
-- secuencia) y con claude_score=33 ya guardado.
--
-- Y nadie lo reintenta: el cron retry_stuck_qa_analyses sólo busca
-- claude_analysis = '{}' (no analizadas), así que una fila YA analizada sin
-- correo queda huérfana para siempre.
--
-- FIX (3 partes):
--   1) `report_email_sent_at` marca idempotente de "el correo ya salió".
--   2) qa-analyze pasa status a 'ready' SERVER-SIDE (deja de depender de que el
--      navegador siga abierto) y marca report_email_sent_at al enviar.
--   3) Cron nuevo `retry_pending_qa_report_emails()`: QAs analizadas, sin correo
--      enviado, de las últimas 24h → invoca qa-analyze en modo email_only
--      (manda el correo sin re-llamar a Claude, así no gasta tokens).
--
-- Backfill: las filas viejas ya analizadas se marcan como enviadas para que el
-- cron nuevo NO dispare una avalancha de correos retroactivos. La ÚNICA excepción
-- es la QA del 29-jul del reporte, que queda pendiente a propósito para que el
-- cron la mande (es la que el equipo está esperando).
-- =============================================================================

alter table public.qa_calls
  add column if not exists report_email_sent_at timestamptz;

comment on column public.qa_calls.report_email_sent_at is
  'Cuándo salió el correo del reporte de QA. NULL = pendiente. Lo setea qa-analyze al enviar; el cron retry_pending_qa_report_emails reintenta los NULL analizados de las últimas 24h. Marca idempotente: evita correos duplicados.';

-- Índice parcial: el cron sólo busca los pendientes.
create index if not exists qa_calls_pending_report_email_idx
  on public.qa_calls (created_at)
  where report_email_sent_at is null;

-- Backfill anti-avalancha: todo lo analizado ANTES de la QA del reporte se marca
-- como ya enviado (aunque algunas no hayan salido por el bug del 401 — mandarlas
-- ahora sería spam de reportes viejos).
update public.qa_calls
set report_email_sent_at = coalesce(report_email_sent_at, created_at)
where report_email_sent_at is null
  and claude_analysis <> '{}'::jsonb
  and created_at < '2026-07-29T00:00:00Z';

-- Consistencia de status: si tiene análisis pero quedó 'processing' porque el
-- navegador se cortó, el estado real es 'ready'.
update public.qa_calls
set status = 'ready'
where status = 'processing'
  and claude_analysis <> '{}'::jsonb
  and claude_score > 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- Cron: reintentar los correos pendientes (modo email_only, sin re-analizar).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.retry_pending_qa_report_emails()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url   text;
  v_token text;
  v_call  record;
  v_count int := 0;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'cron_internal_token' limit 1;
  if v_token is null then
    raise warning 'retry_pending_qa_report_emails: falta cron_internal_token en Vault';
    return;
  end if;
  v_url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/qa-analyze';

  for v_call in
    select id
    from public.qa_calls
    where report_email_sent_at is null
      and claude_analysis <> '{}'::jsonb
      and claude_score > 0
      -- Margen para no pisar la corrida normal que todavía puede estar en vuelo.
      and created_at < now() - interval '5 minutes'
      and created_at > now() - interval '24 hours'
    order by created_at asc
    limit 10
  loop
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Token', v_token),
      body    := jsonb_build_object('call_id', v_call.id, 'email_only', true),
      timeout_milliseconds := 60000
    );
    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    raise notice 'retry_pending_qa_report_emails: % correos de QA reencolados', v_count;
  end if;
end;
$$;

comment on function public.retry_pending_qa_report_emails() is
  'Cada 10 min: QAs ya analizadas cuyo correo de reporte nunca salió (report_email_sent_at IS NULL) → invoca qa-analyze con email_only=true (manda el correo sin re-llamar a Claude). Cubre el caso "el closer cerró la pestaña y el worker se canceló antes del envío". Cap 10 por corrida.';

select cron.unschedule('retry-pending-qa-report-emails')
where exists (select 1 from cron.job where jobname = 'retry-pending-qa-report-emails');

select cron.schedule(
  'retry-pending-qa-report-emails',
  '*/10 * * * *',
  $$select public.retry_pending_qa_report_emails();$$
);
