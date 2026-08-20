-- ═══════════════════════════════════════════════════════════════════════════
-- CÓDIGO DE SALA para Cowork
--
-- POR QUÉ: hasta ahora la ÚNICA puerta de entrada de un participante era el
-- link largo `?session=<uuid>&room=<uuid>`. Si ese link se perdía (WhatsApp lo
-- corta, la PWA lo olvida, el botón "Volver" no lo llevaba), el participante
-- quedaba miembro de la sesión SIN asignación de sala, mirando para siempre un
-- spinner que decía "Esperando asignación de sala por el coordinador…" — una
-- espera imposible, porque `assignToRoom` se eliminó cuando se pasó a self-join
-- por URL. Un código corto es una puerta que sobrevive al copy/paste y se puede
-- dictar por voz.
--
-- El código es POR SALA (no por sesión) a propósito: el coordinador reparte quién
-- va a qué sala, el participante no elige.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.cowork_rooms ADD COLUMN IF NOT EXISTS join_code text;

-- Alfabeto SIN caracteres ambiguos al dictar o transcribir: no hay I, L, O, 0, 1.
-- 31^6 ≈ 887 millones de combinaciones.
CREATE OR REPLACE FUNCTION public.gen_cowork_join_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
BEGIN
  LOOP
    candidate := '';
    FOR _i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.cowork_rooms WHERE join_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

COMMENT ON FUNCTION public.gen_cowork_join_code() IS
  'Genera un código de sala de 6 caracteres, único en cowork_rooms. Alfabeto sin I/L/O/0/1 para poder dictarlo.';

-- Backfill de las salas que ya existen (la función es VOLATILE → se evalúa por fila).
UPDATE public.cowork_rooms SET join_code = public.gen_cowork_join_code() WHERE join_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cowork_rooms_join_code ON public.cowork_rooms(join_code);

-- Toda sala nueva nace con código. Trigger y no DEFAULT porque la generación
-- necesita chequear unicidad contra la tabla.
CREATE OR REPLACE FUNCTION public.tg_cowork_rooms_set_join_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.join_code IS NULL THEN
    NEW.join_code := public.gen_cowork_join_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cowork_rooms_set_join_code ON public.cowork_rooms;
CREATE TRIGGER trg_cowork_rooms_set_join_code
  BEFORE INSERT ON public.cowork_rooms
  FOR EACH ROW EXECUTE FUNCTION public.tg_cowork_rooms_set_join_code();

ALTER TABLE public.cowork_rooms ALTER COLUMN join_code SET NOT NULL;

COMMENT ON COLUMN public.cowork_rooms.join_code IS
  'Código corto que el coordinador comparte para entrar a ESTA sala. Se canjea por la acción joinByCode de la edge cowork-session (que corre con service_role); un participante sin asignación no puede leer esta fila por RLS, así que el código solo circula por donde el coordinador lo manda.';
