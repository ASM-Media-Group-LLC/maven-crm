-- Bot/Agente WhatsApp para Maven CRM.
--
-- Idea (pedida por Alvaro 2026-05-25): un agente IA que vive en los
-- grupos de WhatsApp del equipo y los asiste — lee todo lo que se
-- habla, hace tracking de compromisos ("el lunes contacto a Camila"),
-- arma recordatorios proactivos ("hace 3 días dijiste que contactarías
-- a X, qué pasó?"), responde preguntas con contexto de Maven, genera
-- reportes y puede escribir info en Maven cuando hace falta.
--
-- Arquitectura:
--   provider de WhatsApp (Evolution API por default, podría ser otro)
--     ↓ webhook
--   whatsapp-ingest edge function → guarda en whatsapp_messages
--     ↓ trigger / async
--   whatsapp-extract-commitments → corre Claude sobre el mensaje, detecta
--     compromisos, los inserta en whatsapp_commitments
--     ↓
--   cron whatsapp-followup cada hora → chequea compromisos vencidos y
--     dispara recordatorios al grupo via whatsapp-send
--     ↓
--   whatsapp-agent → cuando alguien lo menciona explícito o el cron
--     decide intervenir, corre Claude con tools (search_leads,
--     get_history, add_note, etc.) y responde
--
-- Multi-tenant: todas las tablas tienen tenant_id, default
-- current_tenant_id() para que los inserts del cliente (cuando los haya)
-- no necesiten setear nada. El service role (edge functions) sí debe
-- setearlo explícito porque current_tenant_id() devuelve NULL para él.

-- ----------------------------------------------------------------------------
-- 1. whatsapp_groups — config de cada grupo monitoreado
-- ----------------------------------------------------------------------------
CREATE TABLE public.whatsapp_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- ID que usa el provider (ej. "120363xxx@g.us" en Evolution API/Baileys).
  external_id   text NOT NULL,
  name          text NOT NULL,
  -- 'evolution' | 'baileys' | 'manual' (insertado a mano para testing).
  provider      text NOT NULL DEFAULT 'evolution',
  -- Si el bot puede ESCRIBIR en este grupo. Si false, solo lee y registra.
  bot_enabled   boolean NOT NULL DEFAULT false,
  -- Sistema prompt extra para personalizar el tono del bot por grupo.
  -- Si null se usa el default del agente.
  bot_persona   text,
  -- Timezone del grupo para parsear "el lunes a las 5pm" etc.
  timezone      text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  active        boolean NOT NULL DEFAULT true,
  -- Última vez que el provider nos mandó un mensaje de este grupo.
  last_message_at timestamptz,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE INDEX whatsapp_groups_tenant_active_idx
  ON public.whatsapp_groups(tenant_id) WHERE active = true;

-- ----------------------------------------------------------------------------
-- 2. whatsapp_members — gente del grupo (mapeo opcional a auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE public.whatsapp_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  -- JID del provider (ej. "549xxx@s.whatsapp.net" en Evolution).
  external_id     text NOT NULL,
  display_name    text NOT NULL,
  -- Free text — 'owner', 'closer', 'llg', 'admin', 'observer'. Lo usamos
  -- para que el agente sepa a quién dirigirse y qué tools puede gatillar.
  role            text,
  -- Si el miembro coincide con un usuario de Maven, lo linkeamos para
  -- que el agente pueda atribuir acciones (ej. "Miguel pasó este lead").
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_number    text,
  active          boolean NOT NULL DEFAULT true,
  last_seen_at    timestamptz,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, external_id)
);

CREATE INDEX whatsapp_members_tenant_idx ON public.whatsapp_members(tenant_id);
CREATE INDEX whatsapp_members_user_idx ON public.whatsapp_members(user_id) WHERE user_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. whatsapp_messages — historial completo
-- ----------------------------------------------------------------------------
CREATE TABLE public.whatsapp_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_id              uuid NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  -- ID del mensaje según el provider — único por grupo para idempotencia.
  external_id           text NOT NULL,
  sender_external_id    text NOT NULL,
  sender_display_name   text,
  member_id             uuid REFERENCES public.whatsapp_members(id) ON DELETE SET NULL,
  body                  text,
  -- 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker' | 'system'.
  msg_type              text NOT NULL DEFAULT 'text',
  media_url             text,
  -- Si fue audio, acá guardamos la transcripción (Whisper/Scribe). Para
  -- imagenes/PDFs guardamos OCR. NULL si no aplica o aún no procesado.
  transcribed_text      text,
  reply_to_external_id  text,
  -- True si el mensaje lo mandó NUESTRO bot (whatsapp-send lo insertó).
  is_from_bot           boolean NOT NULL DEFAULT false,
  sent_at               timestamptz NOT NULL,
  received_at           timestamptz NOT NULL DEFAULT now(),
  -- Cuándo terminamos de procesarlo (extracción de compromisos, etc).
  analyzed_at           timestamptz,
  -- { commitments_extracted: int, mentions: [{name, entity_id?}], topics: [...] }
  analysis              jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Payload crudo del provider, por si necesitamos reprocesar.
  raw                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, external_id)
);

CREATE INDEX whatsapp_messages_group_sent_idx
  ON public.whatsapp_messages(group_id, sent_at DESC);
CREATE INDEX whatsapp_messages_tenant_idx
  ON public.whatsapp_messages(tenant_id);
CREATE INDEX whatsapp_messages_pending_analysis_idx
  ON public.whatsapp_messages(received_at)
  WHERE analyzed_at IS NULL AND is_from_bot = false;
CREATE INDEX whatsapp_messages_sender_idx
  ON public.whatsapp_messages(group_id, sender_external_id, sent_at DESC);

-- ----------------------------------------------------------------------------
-- 4. whatsapp_commitments — compromisos detectados en mensajes
-- ----------------------------------------------------------------------------
CREATE TABLE public.whatsapp_commitments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_id                    uuid NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  -- El mensaje del cual extrajimos el compromiso.
  source_message_id           uuid NOT NULL REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  -- Quién prometió hacer la cosa. Si pudimos matchearlo a un member, va acá.
  committed_by_member_id      uuid REFERENCES public.whatsapp_members(id) ON DELETE SET NULL,
  -- Si no matcheó, dejamos el string crudo para que un humano pueda revisar.
  committed_by_text           text,
  -- Resumen del compromiso. Ej. "contactar a Camila Pérez".
  subject                     text NOT NULL,
  -- Objetivo de la acción (nombre, handle, número, etc.) cuando aplica.
  target_subject              text,
  -- Si pudimos linkearlo a una entidad existente de Maven.
  -- 'lead' | 'creator' | 'spammer_account' | 'ig_account' | null.
  related_entity_type         text,
  related_entity_id           uuid,
  due_at                      timestamptz,
  -- 'pending' | 'done' | 'cancelled' | 'overdue' | 'stale'.
  -- 'overdue' = vencido, no resuelto, esperando seguimiento.
  -- 'stale' = vencido + ya se preguntó N veces sin respuesta, pausado.
  status                      text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','done','cancelled','overdue','stale')),
  resolved_at                 timestamptz,
  resolved_by_message_id      uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  resolution_note             text,
  -- Cuándo el bot mandó el último "qué pasó con X" para no spamear.
  last_followup_at            timestamptz,
  followup_count              integer NOT NULL DEFAULT 0,
  -- Score 0-1 de qué tan seguro está Claude. <0.7 lo dejamos pasar sin
  -- crear seguimientos automáticos pero queda registrado.
  confidence                  numeric(3,2) NOT NULL DEFAULT 1.0,
  metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_commitments_group_status_idx
  ON public.whatsapp_commitments(group_id, status, due_at);
CREATE INDEX whatsapp_commitments_member_idx
  ON public.whatsapp_commitments(committed_by_member_id) WHERE committed_by_member_id IS NOT NULL;
CREATE INDEX whatsapp_commitments_due_pending_idx
  ON public.whatsapp_commitments(due_at)
  WHERE status IN ('pending','overdue');
CREATE INDEX whatsapp_commitments_tenant_idx
  ON public.whatsapp_commitments(tenant_id);

-- ----------------------------------------------------------------------------
-- 5. whatsapp_reminders — mensajes que el bot debe mandar
-- ----------------------------------------------------------------------------
CREATE TABLE public.whatsapp_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  -- 'commitment_followup' | 'scheduled' | 'manual' | 'daily_report' | 'weekly_report'.
  kind            text NOT NULL,
  commitment_id   uuid REFERENCES public.whatsapp_commitments(id) ON DELETE CASCADE,
  -- Cuándo debe dispararse. NULL = inmediato (mandar en próximo tick).
  trigger_at      timestamptz NOT NULL DEFAULT now(),
  -- Mensaje preparado. Si NULL, el agente lo genera en runtime.
  body            text,
  -- 'pending' | 'sent' | 'cancelled' | 'failed'.
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','cancelled','failed')),
  sent_at         timestamptz,
  -- ID del mensaje resultante en whatsapp_messages cuando se envió.
  sent_message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  error           text,
  attempt_count   integer NOT NULL DEFAULT 0,
  -- Quien lo creó (puede ser NULL para crons).
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_reminders_pending_idx
  ON public.whatsapp_reminders(trigger_at)
  WHERE status = 'pending';
CREATE INDEX whatsapp_reminders_group_idx
  ON public.whatsapp_reminders(group_id, trigger_at DESC);
CREATE INDEX whatsapp_reminders_commitment_idx
  ON public.whatsapp_reminders(commitment_id) WHERE commitment_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 6. whatsapp_bot_events — log de actividad del bot (para debug/auditoría)
-- ----------------------------------------------------------------------------
CREATE TABLE public.whatsapp_bot_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_id    uuid REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  -- 'message_in' | 'message_out' | 'commitment_extracted' | 'followup_sent'
  --   | 'agent_invoked' | 'error' | 'ingest_skipped'.
  kind        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_bot_events_group_idx
  ON public.whatsapp_bot_events(group_id, created_at DESC);
CREATE INDEX whatsapp_bot_events_kind_idx
  ON public.whatsapp_bot_events(kind, created_at DESC);
CREATE INDEX whatsapp_bot_events_tenant_idx
  ON public.whatsapp_bot_events(tenant_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 7. updated_at triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER whatsapp_groups_updated
  BEFORE UPDATE ON public.whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_touch_updated_at();
CREATE TRIGGER whatsapp_members_updated
  BEFORE UPDATE ON public.whatsapp_members
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_touch_updated_at();
CREATE TRIGGER whatsapp_commitments_updated
  BEFORE UPDATE ON public.whatsapp_commitments
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 8. RLS — tenant-scoped, igual que el resto de tablas Maven
-- ----------------------------------------------------------------------------
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_bot_events ENABLE ROW LEVEL SECURITY;

-- Reads: solo miembros del tenant.
CREATE POLICY whatsapp_groups_tenant_select ON public.whatsapp_groups
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY whatsapp_members_tenant_select ON public.whatsapp_members
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY whatsapp_messages_tenant_select ON public.whatsapp_messages
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY whatsapp_commitments_tenant_select ON public.whatsapp_commitments
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY whatsapp_reminders_tenant_select ON public.whatsapp_reminders
  FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY whatsapp_bot_events_tenant_select ON public.whatsapp_bot_events
  FOR SELECT USING (tenant_id = public.current_tenant_id());

-- Writes: por ahora solo service_role (edge functions). El frontend
-- escribe via edge functions cuando hace falta (ej. configurar grupo).
-- Esto evita que un usuario casualmente borre mensajes de auditoría.

-- ----------------------------------------------------------------------------
-- 9. RPC: pending_reminders_for_send() — usado por whatsapp-send
-- ----------------------------------------------------------------------------
-- Devuelve recordatorios pending con trigger_at <= now() ordenados por
-- trigger_at. Cap configurable. Marca como 'sent' por separado el caller
-- (vía UPDATE).
CREATE OR REPLACE FUNCTION public.whatsapp_pending_reminders(p_limit integer DEFAULT 20)
RETURNS TABLE (
  id              uuid,
  tenant_id       uuid,
  group_id        uuid,
  kind            text,
  commitment_id   uuid,
  body            text,
  attempt_count   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, tenant_id, group_id, kind, commitment_id, body, attempt_count
  FROM public.whatsapp_reminders
  WHERE status = 'pending'
    AND trigger_at <= now()
  ORDER BY trigger_at ASC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_pending_reminders(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_pending_reminders(integer) TO service_role;

-- ----------------------------------------------------------------------------
-- 10. RPC: whatsapp_bump_commitment_followup — incrementa followup_count
--     atómicamente, evita race con el sender. La usa whatsapp-send.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_bump_commitment_followup(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.whatsapp_commitments
  SET followup_count = followup_count + 1,
      last_followup_at = now(),
      status = CASE
        WHEN status = 'pending' AND due_at IS NOT NULL AND due_at < now() THEN 'overdue'
        WHEN followup_count >= 2 THEN 'stale'
        ELSE status
      END
  WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_bump_commitment_followup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_bump_commitment_followup(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 11. Vista whatsapp_commitments_overdue — para dashboards y cron
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.whatsapp_commitments_overdue AS
SELECT
  c.*,
  g.name AS group_name,
  m.display_name AS committed_by_display_name,
  EXTRACT(EPOCH FROM (now() - c.due_at))/3600 AS hours_overdue
FROM public.whatsapp_commitments c
JOIN public.whatsapp_groups g ON g.id = c.group_id
LEFT JOIN public.whatsapp_members m ON m.id = c.committed_by_member_id
WHERE c.status IN ('pending','overdue')
  AND c.due_at IS NOT NULL
  AND c.due_at < now();

COMMENT ON TABLE public.whatsapp_groups IS
  'Grupos de WhatsApp que el bot monitorea. Un tenant puede tener varios.';
COMMENT ON TABLE public.whatsapp_messages IS
  'Historial completo de mensajes. Inserción idempotente por (group_id, external_id).';
COMMENT ON TABLE public.whatsapp_commitments IS
  'Compromisos extraídos por Claude de los mensajes. Base del tracking pro-activo.';
COMMENT ON TABLE public.whatsapp_reminders IS
  'Cola de mensajes que el bot va a mandar. Cron consume pending y dispara whatsapp-send.';

-- ----------------------------------------------------------------------------
-- 12. Función trigger del cron — invoca whatsapp-followup-tick edge function
-- ----------------------------------------------------------------------------
-- Igual que el patrón de qa-analysis-retry: secrets en vault, pg_net.http_post.
CREATE OR REPLACE FUNCTION public.run_whatsapp_followup_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_token text;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets WHERE name = 'cron_internal_token';

  IF v_url IS NULL OR v_token IS NULL THEN
    RAISE WARNING 'run_whatsapp_followup_tick: faltan secrets en vault';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/whatsapp-followup-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', v_token
    ),
    body := jsonb_build_object('source', 'pg_cron')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_whatsapp_followup_tick() FROM PUBLIC;

-- Schedule: cada 15 minutos. Eso es suficiente para que los reminders
-- no se queden mucho en cola sin desperdiciar invocaciones cuando no
-- hay nada que hacer (el tick es barato si no hay rows pending).
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'whatsapp-followup-tick';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
  PERFORM cron.schedule(
    'whatsapp-followup-tick',
    '*/15 * * * *',
    'SELECT public.run_whatsapp_followup_tick();'
  );
END $$;

COMMENT ON FUNCTION public.run_whatsapp_followup_tick() IS
  'Cada 15 min invoca whatsapp-followup-tick edge function. Esta procesa mensajes pending, marca compromisos overdue, encola recordatorios y drena la queue de envío.';
