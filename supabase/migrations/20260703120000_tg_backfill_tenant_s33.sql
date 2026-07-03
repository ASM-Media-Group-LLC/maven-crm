-- Hotfix S3.3: las filas tg_* ingestadas por telegram-ingest (service_role) quedaban con
-- tenant_id = NULL (el default current_tenant_id() da NULL sin JWT) → la RLS de la bandeja
-- (tenant_id = current_tenant_id()) las ocultaba a TODOS los usuarios. Backfill al tenant
-- mono-inbox (ASM Tech). El ingest ya se corrigió para setear tenant_id explícito. Idempotente.
update public.tg_conversations set tenant_id = '30869615-f579-4981-8a1f-dbebc61eae2d' where tenant_id is null;
update public.tg_messages      set tenant_id = '30869615-f579-4981-8a1f-dbebc61eae2d' where tenant_id is null;
