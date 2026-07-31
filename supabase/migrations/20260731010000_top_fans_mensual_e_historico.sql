-- TOP FANS: convivir MENSUAL + HISTÓRICO (antes solo sobrevivía UNA ventana por creadora).
--
-- BUG DE DISEÑO: la clave única era (blu_model_id, fan_user_id) SIN la ventana, e
-- import_blu_top_fans hacía `delete ... where blu_model_id = any(...)` antes de insertar →
-- cada corrida BORRABA la ventana anterior. Como el sync on-demand ("quick") del blu-bridge
-- usa hoy+ayer, CUALQUIER pedido de data fresca dejaba a las creadoras con top-fans de 2
-- DÍAS: wanderslover facturó $19k en julio y su "top fan" quedaba en $60. Pasó con 51 de 60
-- creadoras.
--
-- FIX: period_kind ('month' | 'alltime' | 'window'), unicidad por
-- (blu_model_id, fan_user_id, period_kind) y borrado SCOPEADO al período que se importa.
ALTER TABLE public.creator_top_fans
  ADD COLUMN IF NOT EXISTS period_kind text NOT NULL DEFAULT 'window';

ALTER TABLE public.creator_top_fans
  DROP CONSTRAINT IF EXISTS creator_top_fans_blu_model_id_fan_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS creator_top_fans_model_fan_period_key
  ON public.creator_top_fans(blu_model_id, fan_user_id, period_kind);

CREATE INDEX IF NOT EXISTS creator_top_fans_creator_period_idx
  ON public.creator_top_fans(creator_id, period_kind, spent_gross DESC);

-- Reclasificar lo existente: lo que cubre un mes o más pasa a 'month' para que 'auto' no
-- elija una ventana de 2 días teniendo algo mejor.
UPDATE public.creator_top_fans
SET period_kind = 'month'
WHERE period_kind = 'window' AND (snapshot_to - snapshot_from) >= 25;
