-- ═══════════════════════════════════════════════════════════════════════════
-- REGLAS DE ALERTA POR SESIÓN de Cowork
--
-- POR QUÉ: hasta ahora los umbrales de los avisos (cámara, encuadre, pantalla,
-- pausas) eran constantes del código, las mismas para toda la empresa. Al
-- abrir Cowork a más departamentos eso dejó de servir: a las managers no se
-- les puede reclamar la pantalla porque no es su norma. Cada sesión lleva
-- ahora sus propias reglas; el supervisor las cambia desde el tablero y
-- aplican en vivo a todos los que están adentro (el realtime de la fila hace
-- que cada navegador las tome sin remontar la llamada).
--
-- NULL = estándar = lo que Cowork hace hoy. Se guarda NULL a propósito, no una
-- copia del estándar: así una sesión sin reglas propias sigue al estándar
-- aunque este cambie mañana.
--
-- La forma del JSON la define frontend/src/lib/coworkReglas.ts (ReglasCowork,
-- la única fuente); la edge cowork-session la espeja y normaliza antes de
-- escribir. La escritura va por la edge (acción setAlertRules, solo host). RLS
-- no cambia: la policy "Hosts can update session" ya cubre a los hosts.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.cowork_sessions
  ADD COLUMN IF NOT EXISTS alert_rules jsonb;

COMMENT ON COLUMN public.cowork_sessions.alert_rules IS
  'Reglas de alerta de ESTA sesión (cámara / encuadre / pantalla / pausas). NULL = estándar, lo que Cowork hace por defecto. El JSON sigue la forma de frontend/src/lib/coworkReglas.ts (ReglasCowork) y lo escribe solo la edge cowork-session (acción setAlertRules, host) después de normalizarlo.';
