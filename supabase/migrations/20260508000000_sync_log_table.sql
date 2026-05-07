-- Tracking table para el sync horario v2 → v3.
-- Cada corrida de la edge function `sync-from-v2` graba acá una fila por tabla
-- sincronizada: cuándo corrió, hasta qué timestamp leyó de v2, cuántas filas
-- copió y si hubo error. La próxima corrida lee el `last_synced_at` por tabla
-- para hacer el sync incremental (solo trae filas con updated_at > last).

CREATE TABLE IF NOT EXISTS public.sync_log (
  id              bigserial PRIMARY KEY,
  table_name      text NOT NULL,
  ran_at          timestamptz NOT NULL DEFAULT now(),
  -- Cota superior del rango leído de v2 en esta corrida. Es lo que la
  -- próxima usa como "desde" para no perder filas que entraron mientras
  -- corría el sync. Se calcula con `now()` ANTES de leer v2.
  synced_through  timestamptz NOT NULL,
  rows_inserted   integer NOT NULL DEFAULT 0,
  rows_updated    integer NOT NULL DEFAULT 0,
  rows_skipped    integer NOT NULL DEFAULT 0,
  duration_ms     integer,
  error           text,
  status          text NOT NULL CHECK (status IN ('ok', 'error', 'partial'))
);

-- Index para sacar rápido el último sync por tabla.
CREATE INDEX IF NOT EXISTS idx_sync_log_table_ran
  ON public.sync_log(table_name, ran_at DESC);

-- Helper: devuelve el último `synced_through` exitoso por tabla. La edge
-- function lo llama al inicio para saber desde dónde leer v2.
-- Si la tabla nunca se sincronizó devuelve epoch (1970) para forzar full
-- sync inicial.
CREATE OR REPLACE FUNCTION public.last_sync_for(p_table text)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT synced_through
       FROM public.sync_log
      WHERE table_name = p_table
        AND status = 'ok'
      ORDER BY ran_at DESC
      LIMIT 1),
    'epoch'::timestamptz
  );
$$;

-- RLS: solo admins ven sync_log. Es ruido operacional, no data de negocio.
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_log_admin_only ON public.sync_log;
CREATE POLICY sync_log_admin_only ON public.sync_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin', 'manager', 'supervisor')
    )
  );
