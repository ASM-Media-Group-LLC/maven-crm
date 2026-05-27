-- whatsapp_bot_rules — reglas persistentes que el OWNER le enseña al bot.
--
-- Idea: cuando Alvaro (is_owner=true) dice algo tipo "siempre que aparezca
-- un perfil con menos de 30K seguidores y sin OF, descartar", el agent
-- detecta el intent + guarda la regla aquí. En cada invocación del agent
-- para ese grupo, las reglas activas se inyectan dinámicamente en el
-- system prompt para que el modelo las aplique.
--
-- Solo el owner puede crear/desactivar reglas (enforced en el dispatch
-- de la tool, no por RLS).
--
-- Scope: por grupo. Reglas de un grupo no aplican a otro.

CREATE TABLE IF NOT EXISTS public.whatsapp_bot_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  rule_text text NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES public.profiles(id),
  active boolean NOT NULL DEFAULT true,
  source_message_id text NULL,  -- el message_id del mensaje del owner que disparó la regla
  created_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz NULL,
  deactivated_by_user_id uuid NULL REFERENCES public.profiles(id),
  expires_at timestamptz NULL    -- opcional: regla temporal
);

CREATE INDEX IF NOT EXISTS whatsapp_bot_rules_group_active_idx
  ON public.whatsapp_bot_rules (group_id) WHERE active = true;

CREATE INDEX IF NOT EXISTS whatsapp_bot_rules_group_created_idx
  ON public.whatsapp_bot_rules (group_id, created_at DESC);

ALTER TABLE public.whatsapp_bot_rules ENABLE ROW LEVEL SECURITY;

-- Service role bypassa RLS (las edge functions usan service role).
-- Frontend admin podrá leer pero por ahora sin policy explícita.

COMMENT ON TABLE public.whatsapp_bot_rules IS
  'Reglas persistentes que el owner del grupo le enseña al bot. Se inyectan en el system prompt del agent en cada invocación para que el modelo las aplique.';

COMMENT ON COLUMN public.whatsapp_bot_rules.rule_text IS
  'La regla redactada como instrucción accionable en español. Ej: "Cuando aparezca un perfil con <30K seguidores y sin OF, sugerir descarte".';
