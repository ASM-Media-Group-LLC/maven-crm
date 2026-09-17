-- CALENDARIO · invitar a personas concretas.
--
-- Hasta acá compartir era binario: o el evento era mío, o lo veía todo el
-- equipo. Jhon (17/09/2026): "no me permites ir invitando a las personas que yo
-- quiera como lo hace Google". Tenía razón — en Google la fila que importa del
-- diálogo es "Add guests", y cada invitado responde si va o no.
--
-- Los invitados son ORTOGONALES a `visibility`: un evento puede seguir siendo
-- privado y aun así tener invitados, que lo ven porque están invitados. No se
-- vuelve del equipo por invitar a tres personas.

CREATE TABLE IF NOT EXISTS public.calendar_event_guests (
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'pendiente' es el estado real de alguien que todavía no contestó; no es lo
  -- mismo que "no va", y mostrarlos igual haría creer que la gente rechazó.
  respuesta text NOT NULL DEFAULT 'pendiente'
    CHECK (respuesta IN ('pendiente', 'va', 'no_va', 'quizas')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- "Qué me invitaron": la consulta del calendario de cada persona.
CREATE INDEX IF NOT EXISTS calendar_event_guests_user_idx
  ON public.calendar_event_guests (user_id);

-- ── ⚠️ Por qué estas dos funciones existen ─────────────────────────────────
-- La política de `calendar_events` necesita preguntar "¿estoy invitado?", y la
-- de `calendar_event_guests` necesita preguntar "¿soy el dueño del evento?".
-- Escritas como subconsultas sueltas se llaman entre sí y Postgres corta con
-- "infinite recursion detected in policy" — el mismo error que ya nos pasó con
-- los documentos. SECURITY DEFINER salta la RLS adentro y corta el ciclo.
CREATE OR REPLACE FUNCTION public.soy_invitado_al_evento(p_evento uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.calendar_event_guests g
    WHERE g.event_id = p_evento AND g.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.soy_dueno_del_evento(p_evento uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.calendar_events e
    WHERE e.id = p_evento AND e.owner_id = auth.uid()
  );
$$;

-- ── El evento se ve también si me invitaron ────────────────────────────────
DROP POLICY IF EXISTS "Ver eventos propios y del equipo" ON public.calendar_events;
CREATE POLICY "Ver eventos propios, del equipo y a los que me invitaron"
  ON public.calendar_events FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR visibility = 'equipo'
    OR public.soy_invitado_al_evento(id)
  );

-- ── Quién toca la lista de invitados ───────────────────────────────────────
ALTER TABLE public.calendar_event_guests ENABLE ROW LEVEL SECURITY;

-- Un invitado ve a los demás invitados, como en Google: saber quién más va es
-- la mitad de la información de una reunión.
CREATE POLICY "Ver invitados de un evento que puedo ver"
  ON public.calendar_event_guests FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.soy_dueno_del_evento(event_id)
    OR public.soy_invitado_al_evento(event_id)
  );

-- Invitar y desinvitar: solo quien organiza.
CREATE POLICY "Invitar a mi evento"
  ON public.calendar_event_guests FOR INSERT TO authenticated
  WITH CHECK (public.soy_dueno_del_evento(event_id));

CREATE POLICY "Desinvitar de mi evento"
  ON public.calendar_event_guests FOR DELETE TO authenticated
  USING (public.soy_dueno_del_evento(event_id));

-- ⚠️ Responder: SOLO el invitado, y solo lo suyo. El dueño NO contesta por
-- otro: una reunión donde el organizador puede marcar "va" en nombre de la
-- gente no sirve para saber quién va.
CREATE POLICY "Responder a mi invitación"
  ON public.calendar_event_guests FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- La política de UPDATE ya impide tocar filas ajenas, pero no impide que
-- alguien mueva SU fila a otro evento. El trigger congela las dos llaves.
CREATE OR REPLACE FUNCTION public.tocar_invitado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.event_id = OLD.event_id;
  NEW.user_id = OLD.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calendar_event_guests_congelar ON public.calendar_event_guests;
CREATE TRIGGER calendar_event_guests_congelar
  BEFORE UPDATE ON public.calendar_event_guests
  FOR EACH ROW
  EXECUTE FUNCTION public.tocar_invitado();

COMMENT ON TABLE public.calendar_event_guests IS
  'A quien se invito a un evento y que contesto. Ortogonal a visibility.';
