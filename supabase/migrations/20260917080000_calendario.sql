-- CALENDARIO · los eventos propios de Maven.
--
-- Hasta ahora Maven NO tenía un solo evento futuro: `cowork_meets`,
-- `meet_rooms` y `creator_milestones` son todos registros de algo que YA pasó.
-- Esta es la primera tabla de cosas agendadas.
--
-- Primer corte: eventos que la persona crea a mano. El segundo trae las
-- invitaciones que llegan por correo (ya se saben leer, ver lib/ics.ts) y de
-- ahí el aceptar/rechazar. Por eso algunas columnas nacen sin uso todavía
-- (`external_uid`, `organiza_*`, `estado`): agregarlas ahora cuesta nada y
-- ahorra una migración sobre una tabla que ya tendrá datos.

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title text NOT NULL,
  -- ⚠️ TODO_EL_DIA Y ZONAS HORARIAS.
  -- Un evento con hora se guarda como el instante que es. Uno de DÍA COMPLETO
  -- se ancla a MEDIANOCHE UTC y se muestra SIEMPRE en UTC — es la convención
  -- de iCalendar para valores DATE. Si se guardara en hora local, el mismo
  -- "17 de septiembre" se vería como el 16 para quien mire desde otra zona, y
  -- un feriado corrido un día es de los errores que más rápido hacen
  -- desconfiar de un calendario.
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,

  location text,
  description text,
  -- Link de la videollamada. Se guarda aparte del lugar porque es lo primero
  -- que busca quien abre el evento cinco minutos antes.
  url text,

  -- Mismo vocabulario que `documents`: o es mío, o lo ve el equipo.
  visibility text NOT NULL DEFAULT 'privado'
    CHECK (visibility IN ('privado', 'equipo')),

  -- De dónde salió. 'correo' lo usará el segundo corte.
  source text NOT NULL DEFAULT 'maven'
    CHECK (source IN ('maven', 'correo')),
  -- El UID del .ics. Sirve para que una invitación ACTUALIZADA pise a la
  -- vieja en vez de duplicarla — Google manda la misma reunión varias veces.
  external_uid text,

  organiza_nombre text,
  organiza_email text,

  estado text NOT NULL DEFAULT 'confirmado'
    CHECK (estado IN ('confirmado', 'cancelado')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Un evento que termina antes de empezar es un dato roto, no una preferencia.
  CONSTRAINT calendar_events_orden CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

-- La consulta de siempre es "qué tengo en este mes": dueño + rango de fechas.
CREATE INDEX IF NOT EXISTS calendar_events_owner_starts_idx
  ON public.calendar_events (owner_id, starts_at);

-- Lo del equipo se busca sin filtrar por dueño.
CREATE INDEX IF NOT EXISTS calendar_events_equipo_starts_idx
  ON public.calendar_events (starts_at)
  WHERE visibility = 'equipo';

-- ⚠️ Una invitación que llega dos veces (Google manda la misma reunión como
-- `invite.ics` y como adjunto sin nombre) tiene que ser UN evento, no dos.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_uid_unico
  ON public.calendar_events (owner_id, external_uid)
  WHERE external_uid IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tocar_evento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  -- El dueño no se cambia: un evento no cambia de calendario. Sin esto, un
  -- update podría mover el evento de una persona a otra.
  NEW.owner_id = OLD.owner_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.tocar_evento();

-- ── Quién ve qué ────────────────────────────────────────────────────────────
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver eventos propios y del equipo"
  ON public.calendar_events FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR visibility = 'equipo');

CREATE POLICY "Crear eventos propios"
  ON public.calendar_events FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- ⚠️ Editar y borrar: SOLO el dueño, a diferencia de los documentos de equipo.
-- Un documento compartido se edita entre varios porque ese es el punto; una
-- reunión ajena no se le mueve de hora a nadie.
CREATE POLICY "Editar eventos propios"
  ON public.calendar_events FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Borrar eventos propios"
  ON public.calendar_events FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

COMMENT ON TABLE public.calendar_events IS
  'Eventos del calendario de Maven. Día completo = medianoche UTC, se muestra en UTC.';
