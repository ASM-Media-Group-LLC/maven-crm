-- Cola de confirmación para post_to_group: el owner puede pedirle al bot desde su DM que
-- publique en un grupo, pero NUNCA se manda en la misma corrida en que se compone.
-- Flujo obligado en DOS turnos: 1) el bot llama la tool sin pending_id → se guarda acá y
-- devuelve el texto para que la persona lo lea; 2) recién con el pending_id (que solo existe
-- si hubo un paso 1) y confirm=true se publica. Así el modelo NO puede auto-confirmarse:
-- el camino de envío exige una fila creada en una corrida anterior.
CREATE TABLE IF NOT EXISTS public.whatsapp_pending_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  target_group_id uuid NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  requested_from_group_id uuid REFERENCES public.whatsapp_groups(id) ON DELETE SET NULL,
  requested_by_user_id uuid,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS whatsapp_pending_posts_status_idx
  ON public.whatsapp_pending_posts(status, created_at DESC);

ALTER TABLE public.whatsapp_pending_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_pending_posts FROM public, anon;
GRANT ALL ON public.whatsapp_pending_posts TO service_role;
