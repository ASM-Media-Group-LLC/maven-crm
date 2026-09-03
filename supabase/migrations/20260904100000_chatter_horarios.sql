-- ═══════════════════════════════════════════════════════════════════════════
-- HORARIOS DE CHATTERS (reemplaza el Excel "Horarios Chatters KASH")
--
-- La forma real del dato del Excel es una sola: un chatter, en un turno
-- (AM / PM / madrugada), dentro de un grupo de una agencia, atiende una lista
-- de creadoras y descansa un dia de la semana; ese dia lo cubre alguien.
--
-- Las asignaciones (grupo ↔ chatter, grupo ↔ creadora) tienen VIGENCIA porque
-- cambian poco; los descansos van POR SEMANA porque cambian siempre. Asi el
-- pasado no se altera cuando alguien reorganiza un grupo.
--
-- Visibilidad: el chatter ve SOLO lo suyo (su fila de miembro, las creadoras
-- de su grupo, sus descansos y los que cubre). No ve al companero del otro
-- turno ni al resto de los grupos. Eso lo garantiza RLS, no la pantalla.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tablas ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chatter_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency text NOT NULL CHECK (agency IN ('plus', 'massive')),
  name text NOT NULL,
  lead_name text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency, name)
);

CREATE TABLE IF NOT EXISTS public.chatter_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.chatter_groups(id) ON DELETE CASCADE,
  identity_id uuid NOT NULL REFERENCES public.chatter_identity(id) ON DELETE CASCADE,
  shift text NOT NULL CHECK (shift IN ('am', 'pm', 'mad')),
  is_supernumerary boolean NOT NULL DEFAULT false,
  -- Numero que el Excel escribia junto al nombre ("Camila Sogamoso 90"). Se
  -- conserva tal cual hasta saber que es.
  sheet_tag integer,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cgm_identity ON public.chatter_group_members(identity_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_cgm_group ON public.chatter_group_members(group_id) WHERE valid_to IS NULL;

CREATE TABLE IF NOT EXISTS public.chatter_group_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.chatter_groups(id) ON DELETE CASCADE,
  -- Ligada a la creadora real cuando se pudo resolver; el handle se guarda
  -- siempre porque ~17 cuentas del Excel no existen en Maven.
  creator_id uuid REFERENCES public.creators(id) ON DELETE SET NULL,
  creator_handle text NOT NULL,
  ig boolean NOT NULL DEFAULT false,
  mad boolean NOT NULL DEFAULT false,
  sop boolean NOT NULL DEFAULT false,
  tag text,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cgc_group ON public.chatter_group_creators(group_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_cgc_creator ON public.chatter_group_creators(creator_id) WHERE valid_to IS NULL;

CREATE TABLE IF NOT EXISTS public.chatter_rest_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  agency text NOT NULL CHECK (agency IN ('plus', 'massive')),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = lunes
  shift text NOT NULL CHECK (shift IN ('am', 'pm', 'mad')),
  -- NULL cuando la fila es solo una nota del dia ("Cierre de mes").
  identity_id uuid REFERENCES public.chatter_identity(id) ON DELETE CASCADE,
  covered_by_identity_id uuid REFERENCES public.chatter_identity(id) ON DELETE SET NULL,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Una persona descansa una vez por semana; una nota del dia tambien es unica.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rest_identity_week
  ON public.chatter_rest_days(week_start, identity_id) WHERE identity_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rest_note_day
  ON public.chatter_rest_days(week_start, agency, weekday, shift) WHERE identity_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_rest_week ON public.chatter_rest_days(week_start DESC, agency);

COMMENT ON TABLE public.chatter_groups IS 'Grupos de chatters por agencia (Kash Plus / Massive). Reemplaza el Excel de horarios.';
COMMENT ON TABLE public.chatter_group_members IS 'Chatter ↔ grupo con turno y vigencia. Un chatter vigente = valid_to IS NULL.';
COMMENT ON TABLE public.chatter_group_creators IS 'Creadoras que atiende cada grupo, con marcas IG/MAD/SOP y vigencia.';
COMMENT ON TABLE public.chatter_rest_days IS 'Descansos por semana (week_start = lunes, weekday 0 = lunes). identity_id NULL = nota del dia.';

DROP TRIGGER IF EXISTS trg_chatter_groups_updated ON public.chatter_groups;
CREATE TRIGGER trg_chatter_groups_updated BEFORE UPDATE ON public.chatter_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_chatter_rest_days_updated ON public.chatter_rest_days;
CREATE TRIGGER trg_chatter_rest_days_updated BEFORE UPDATE ON public.chatter_rest_days
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Funciones de acceso ──────────────────────────────────────────────────────

-- Identidad de chatter del usuario logueado (la misma que usa Rendimiento).
CREATE OR REPLACE FUNCTION public.my_chatter_identity()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id FROM public.chatter_identity i WHERE i.maven_user_id = auth.uid() LIMIT 1
$$;

-- Supervisor del modulo: supervisor o superior CON el modulo Chatters
-- habilitado en su rol (el tier solo no alcanza, igual que en Personalizados).
CREATE OR REPLACE FUNCTION public.chatter_horarios_supervisa(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_in_role_group(_uid, 'supervisor_or_above')
     AND public.has_permission(_uid, 'Chatters')
$$;

-- Puede editar horarios: la funcion "Horarios · Gestionar" del modulo Chatters
-- (fila explicita en Administracion → Roles) o, sin fila, supervisor o superior.
CREATE OR REPLACE FUNCTION public.chatter_horarios_gestiona(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(_uid, 'Chatters')
     AND public.can_use_module_function(_uid, 'Chatters', 'Horarios · Gestionar', 'supervisor_or_above')
$$;

-- Grupos vigentes del usuario logueado (como chatter).
CREATE OR REPLACE FUNCTION public.my_chatter_group_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.group_id FROM public.chatter_group_members m
  WHERE m.identity_id = public.my_chatter_identity()
    AND m.valid_to IS NULL AND m.valid_from <= CURRENT_DATE
$$;

-- ¿Puede este usuario ver el perfil de esta creadora por estar en su roster?
-- Lo usa la ruta /creadores/:id como alternativa al permiso Creadores · Perfil.
CREATE OR REPLACE FUNCTION public.chatter_can_view_creator(_uid uuid, _creator_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chatter_identity i
    JOIN public.chatter_group_members m ON m.identity_id = i.id
      AND m.valid_to IS NULL AND m.valid_from <= CURRENT_DATE
    JOIN public.chatter_group_creators c ON c.group_id = m.group_id
      AND c.valid_to IS NULL AND c.valid_from <= CURRENT_DATE
    WHERE i.maven_user_id = _uid AND c.creator_id = _creator_id
  )
$$;

REVOKE ALL ON FUNCTION public.my_chatter_identity() FROM public;
REVOKE ALL ON FUNCTION public.my_chatter_group_ids() FROM public;
REVOKE ALL ON FUNCTION public.chatter_horarios_supervisa(uuid) FROM public;
REVOKE ALL ON FUNCTION public.chatter_horarios_gestiona(uuid) FROM public;
REVOKE ALL ON FUNCTION public.chatter_can_view_creator(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.my_chatter_identity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_chatter_group_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.chatter_horarios_supervisa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chatter_horarios_gestiona(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chatter_can_view_creator(uuid, uuid) TO authenticated;

-- ── Copiar semana anterior ───────────────────────────────────────────────────
-- Los descansos rotan: quien descanso el lunes descansa el martes la semana
-- siguiente (asi lo lleva el equipo). Por eso el default es rotar un dia; el
-- supervisor puede pedir copia exacta y despues editar celda por celda.
CREATE OR REPLACE FUNCTION public.chatter_rest_days_copy_week(
  _agency text, _from_week date, _to_week date, _rotate boolean DEFAULT true)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.chatter_horarios_gestiona(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para gestionar horarios';
  END IF;
  IF EXISTS (SELECT 1 FROM public.chatter_rest_days WHERE agency = _agency AND week_start = _to_week) THEN
    RAISE EXCEPTION 'La semana destino ya tiene descansos cargados';
  END IF;
  INSERT INTO public.chatter_rest_days (week_start, agency, weekday, shift, identity_id, covered_by_identity_id, note, created_by)
  SELECT _to_week, agency,
         CASE WHEN _rotate AND identity_id IS NOT NULL THEN (weekday + 1) % 7 ELSE weekday END,
         shift, identity_id, covered_by_identity_id,
         CASE WHEN identity_id IS NULL THEN NULL ELSE note END, -- las notas del dia no viajan
         auth.uid()
  FROM public.chatter_rest_days
  WHERE agency = _agency AND week_start = _from_week
    AND identity_id IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.chatter_rest_days_copy_week(text, date, date, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.chatter_rest_days_copy_week(text, date, date, boolean) TO authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.chatter_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatter_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatter_group_creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatter_rest_days ENABLE ROW LEVEL SECURITY;

-- Grupos: supervisor ve todos; el chatter, solo el suyo.
DROP POLICY IF EXISTS "horarios grupos select" ON public.chatter_groups;
CREATE POLICY "horarios grupos select" ON public.chatter_groups FOR SELECT TO authenticated
  USING (public.chatter_horarios_supervisa(auth.uid()) OR id IN (SELECT public.my_chatter_group_ids()));
DROP POLICY IF EXISTS "horarios grupos write" ON public.chatter_groups;
CREATE POLICY "horarios grupos write" ON public.chatter_groups FOR ALL TO authenticated
  USING (public.chatter_horarios_gestiona(auth.uid())) WITH CHECK (public.chatter_horarios_gestiona(auth.uid()));

-- Miembros: el chatter ve SOLO su propia fila (no al companero del otro turno).
DROP POLICY IF EXISTS "horarios miembros select" ON public.chatter_group_members;
CREATE POLICY "horarios miembros select" ON public.chatter_group_members FOR SELECT TO authenticated
  USING (public.chatter_horarios_supervisa(auth.uid()) OR identity_id = public.my_chatter_identity());
DROP POLICY IF EXISTS "horarios miembros write" ON public.chatter_group_members;
CREATE POLICY "horarios miembros write" ON public.chatter_group_members FOR ALL TO authenticated
  USING (public.chatter_horarios_gestiona(auth.uid())) WITH CHECK (public.chatter_horarios_gestiona(auth.uid()));

-- Creadoras: las de su grupo.
DROP POLICY IF EXISTS "horarios creadoras select" ON public.chatter_group_creators;
CREATE POLICY "horarios creadoras select" ON public.chatter_group_creators FOR SELECT TO authenticated
  USING (public.chatter_horarios_supervisa(auth.uid()) OR group_id IN (SELECT public.my_chatter_group_ids()));
DROP POLICY IF EXISTS "horarios creadoras write" ON public.chatter_group_creators;
CREATE POLICY "horarios creadoras write" ON public.chatter_group_creators FOR ALL TO authenticated
  USING (public.chatter_horarios_gestiona(auth.uid())) WITH CHECK (public.chatter_horarios_gestiona(auth.uid()));

-- Descansos: los propios, los que cubre, y las notas del dia de su agencia.
DROP POLICY IF EXISTS "horarios descansos select" ON public.chatter_rest_days;
CREATE POLICY "horarios descansos select" ON public.chatter_rest_days FOR SELECT TO authenticated
  USING (
    public.chatter_horarios_supervisa(auth.uid())
    OR identity_id = public.my_chatter_identity()
    OR covered_by_identity_id = public.my_chatter_identity()
    OR (identity_id IS NULL AND agency IN (SELECT g.agency FROM public.chatter_groups g WHERE g.id IN (SELECT public.my_chatter_group_ids())))
  );
DROP POLICY IF EXISTS "horarios descansos write" ON public.chatter_rest_days;
CREATE POLICY "horarios descansos write" ON public.chatter_rest_days FOR ALL TO authenticated
  USING (public.chatter_horarios_gestiona(auth.uid())) WITH CHECK (public.chatter_horarios_gestiona(auth.uid()));

-- Los chatters necesitan leer el nombre de quien los cubre. chatter_identity
-- solo dejaba ver la propia; se abre el nombre (no el email) a quien tenga
-- una relacion de cobertura o comparta grupo... sin exponer al resto: una
-- funcion que devuelve solo display_name por id.
CREATE OR REPLACE FUNCTION public.chatter_display_names(_ids uuid[])
RETURNS TABLE (id uuid, display_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.display_name FROM public.chatter_identity i WHERE i.id = ANY(_ids)
$$;
REVOKE ALL ON FUNCTION public.chatter_display_names(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.chatter_display_names(uuid[]) TO authenticated;
