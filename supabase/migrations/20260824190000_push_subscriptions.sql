-- Suscripciones Web Push del navegador: para avisar de una llamada entrante
-- aunque Maven esté CERRADO o en otra pestaña (el service worker recibe el push
-- y muestra la notificación).
--
-- Una persona puede tener varias (una por navegador/dispositivo). La clave es
-- el `endpoint` (la URL del push service que da el navegador). Guardamos las
-- claves de cifrado que el navegador entrega (p256dh, auth); sin ellas el push
-- no se puede encriptar. El envío lo hace la edge con service_role.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- El mismo navegador re-suscribiéndose actualiza en vez de duplicar.
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Cada uno gestiona SOLO las suyas. El envío no pasa por acá: la edge lee las
-- del destinatario con service_role.
CREATE POLICY "ver las propias suscripciones push"
  ON public.push_subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "gestionar las propias suscripciones push"
  ON public.push_subscriptions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

COMMENT ON TABLE public.push_subscriptions IS
  'Suscripciones Web Push por navegador/usuario, para notificar llamadas entrantes con Maven cerrado. El envío lo hace la edge web-push con service_role.';
