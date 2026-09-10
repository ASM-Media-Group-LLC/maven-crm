-- ═══════════════════════════════════════════════════════════════════════════
-- QUIÉN TOCÓ LAS REGLAS DE LA SESIÓN
--
-- Pedido de Jhon (09/09/2026): vio cuatro sesiones activas con reglas propias
-- —dos de ellas con TODAS las alertas apagadas, o sea sin supervisión— y no
-- había forma de saber quién las había puesto así.
--
-- Antes solo quedaba `updated_at`, que además se mueve al renombrar la sesión,
-- así que ni siquiera servía de pista firme. La auditoría general (`audit_log`)
-- solo cubre cambios de rol.
--
-- No se puede reconstruir lo ya hecho: esto empieza a registrar desde ahora.
-- Las cuatro que ya están personalizadas van a mostrarse sin autor hasta que
-- alguien las vuelva a guardar.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.cowork_sessions
  ADD COLUMN IF NOT EXISTS alert_rules_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alert_rules_updated_at timestamptz;

COMMENT ON COLUMN public.cowork_sessions.alert_rules_updated_by IS
  'Quién guardó por última vez las reglas de alerta de esta sesión. Solo los hosts pueden. NULL = nadie las tocó desde que existe esta columna (10/09/2026).';
COMMENT ON COLUMN public.cowork_sessions.alert_rules_updated_at IS
  'Cuándo se guardaron por última vez las reglas. Distinto de updated_at, que también se mueve al renombrar la sesión.';
