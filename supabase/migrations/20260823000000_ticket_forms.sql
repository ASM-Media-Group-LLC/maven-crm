-- ═══════════════════════════════════════════════════════════════════════════
-- PLANTILLAS DE TICKET (el Google Forms de Sheets, dentro de Maven)
--
-- POR QUÉ: hoy el equipo levanta tickets con un Google Form que escribe en la
-- hoja `ESCALAMIENTO QUEJA/SOLICITUD v3`, y un Apps Script manda el correo con
-- los destinatarios HARDCODEADOS en el código. Cada cambio de equipo obliga a
-- editar el script, y por eso quedaron ex-empleados recibiendo tickets.
--
-- El módulo Tickets de Maven tenía el mismo problema del otro lado: esquema
-- fijo, con los 5 tipos de ticket y los 38 miembros del equipo clavados en
-- useTickets.ts.
--
-- Este esquema le da al equipo la herramienta para armar sus propios
-- formularios sin tocar código:
--   ticket_forms        → la plantilla ("Escalamiento Queja/Solicitud"), su prefijo y
--                         destinatarios de correo.
--   ticket_form_fields  → los campos de esa plantilla, ordenables.
--   tickets             → gana form_id, ticket_code y answers jsonb.
--
-- DECISIÓN DE DISEÑO — por qué `answers jsonb` y no columnas nuevas:
-- las respuestas propias de cada plantilla van al jsonb, pero las columnas que
-- la lista, los filtros y el flujo de estados YA usan (title, priority, status,
-- assigned_to, company) siguen siendo columnas reales. Un campo de la plantilla
-- puede declarar `maps_to` para alimentar una de esas columnas. Así el tab de
-- Tickets sigue funcionando sin reescribirse, y cada plantilla igual tiene sus
-- propios campos.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. PLANTILLAS
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ticket_forms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,

  -- Prefijo del código. "TK" → TK-0001, TK-0002, … sin reiniciarse nunca.
  code_prefix  text NOT NULL,

  -- Presentación de la tarjeta en el tab de Tickets.
  icon         text NOT NULL DEFAULT 'Ticket',
  color        text NOT NULL DEFAULT 'slate',

  -- ¿Este tipo de ticket es sobre una creadora? Lo decide cada plantilla:
  -- 'required' pide creadora, 'optional' la deja opcional, 'none' no la muestra.
  creator_mode text NOT NULL DEFAULT 'optional'
               CHECK (creator_mode IN ('required', 'optional', 'none')),

  -- Destinatarios del correo de notificación, administrables desde la UI.
  -- Reemplaza la lista hardcodeada del Apps Script.
  notify_emails text[] NOT NULL DEFAULT '{}',
  notify_enabled boolean NOT NULL DEFAULT true,

  -- Contador del código. Se incrementa atómicamente en next_ticket_code().
  -- Arranca en 1; para la plantilla semilla se siembra en 160 y continua
  -- justo donde quedó la hoja (TK-0159 fue el último).
  next_number  integer NOT NULL DEFAULT 1 CHECK (next_number >= 1),

  is_published boolean NOT NULL DEFAULT false,
  position     integer NOT NULL DEFAULT 0,

  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz,

  CONSTRAINT ticket_forms_name_not_blank   CHECK (btrim(name) <> ''),
  CONSTRAINT ticket_forms_prefix_format    CHECK (code_prefix ~ '^[A-Z][A-Z0-9]{0,7}$')
);

-- El prefijo es único a nivel GLOBAL y a propósito: es lo que garantiza que
-- ticket_code no colisione nunca. Sin `WHERE archived_at IS NULL`, porque una
-- plantilla archivada deja tickets históricos vivos con ese prefijo y otra
-- plantilla nueva no puede volver a usarlo.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_forms_code_prefix_key
  ON public.ticket_forms (upper(code_prefix));

CREATE INDEX IF NOT EXISTS ticket_forms_published_idx
  ON public.ticket_forms (position, name) WHERE is_published AND archived_at IS NULL;

DROP TRIGGER IF EXISTS update_ticket_forms_updated_at ON public.ticket_forms;
CREATE TRIGGER update_ticket_forms_updated_at
  BEFORE UPDATE ON public.ticket_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE  public.ticket_forms IS
  'Plantillas de ticket que el equipo arma desde la UI (equivalente al Google Form de la hoja de Quejas). Cada una tiene su prefijo de código, su contador y sus destinatarios de correo.';
COMMENT ON COLUMN public.ticket_forms.next_number IS
  'Próximo consecutivo a entregar. Lo incrementa next_ticket_code() con UPDATE..RETURNING (atómico). NUNCA leer-y-sumar desde el cliente: con dos personas creando a la vez saldrían códigos duplicados.';
COMMENT ON COLUMN public.ticket_forms.notify_emails IS
  'Destinatarios del correo al crear el ticket. Editable desde la UI — reemplaza la lista hardcodeada del Apps Script.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. CAMPOS DE CADA PLANTILLA
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ticket_form_fields (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id     uuid NOT NULL REFERENCES public.ticket_forms(id) ON DELETE CASCADE,

  label       text NOT NULL,
  -- Clave con la que la respuesta se guarda en tickets.answers.
  field_key   text NOT NULL,

  -- Ojo: NO hay tipo 'creator'. Que el ticket lleve creadora lo decide
  -- ticket_forms.creator_mode y el selector lo pinta el renderer a partir de
  -- eso. Un segundo mecanismo para lo mismo solo genera ambigüedad.
  field_type  text NOT NULL CHECK (field_type IN (
                'text', 'textarea', 'number', 'currency', 'percent',
                'date', 'select', 'multiselect', 'checkbox',
                'email', 'url', 'instagram', 'user', 'drive_links'
              )),

  help_text   text,
  placeholder text,
  is_required boolean NOT NULL DEFAULT false,

  -- Opciones de select/multiselect. Dos formas admitidas:
  --   ["Chats", "Cobro"]                              → valor = etiqueta
  --   [{"value":"high","label":"Alta"}, ...]           → valor ≠ etiqueta
  -- La segunda es OBLIGATORIA cuando el campo tiene maps_to a una columna con
  -- catálogo cerrado (priority, company): si se guarda la etiqueta visible en
  -- vez del valor, los filtros y las etiquetas de la lista dejan de resolver.
  options     jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Si está seteado, la respuesta ADEMÁS alimenta esa columna real de tickets,
  -- para que los filtros, el kanban y los estados sigan funcionando.
  maps_to     text CHECK (maps_to IN (
                'title', 'description', 'priority', 'assigned_to',
                'company', 'creator_notes'
              )),

  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ticket_form_fields_label_not_blank CHECK (btrim(label) <> ''),
  -- snake_case: es una clave de jsonb, no un texto libre.
  CONSTRAINT ticket_form_fields_key_format CHECK (field_key ~ '^[a-z][a-z0-9_]{0,48}$'),
  -- select/multiselect sin opciones es un campo inservible.
  CONSTRAINT ticket_form_fields_options_needed CHECK (
    field_type NOT IN ('select', 'multiselect')
    OR jsonb_array_length(options) > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ticket_form_fields_form_key_key
  ON public.ticket_form_fields (form_id, field_key);

-- Dos campos no pueden alimentar la misma columna real: el segundo pisaría al
-- primero de forma no determinística.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_form_fields_form_maps_to_key
  ON public.ticket_form_fields (form_id, maps_to) WHERE maps_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS ticket_form_fields_form_position_idx
  ON public.ticket_form_fields (form_id, position);

COMMENT ON COLUMN public.ticket_form_fields.maps_to IS
  'Opcional. Además de guardarse en answers, la respuesta escribe esta columna real de tickets, para que los filtros y el flujo de estados existentes sigan aplicando.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. TICKETS: enganche con la plantilla
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS form_id     uuid REFERENCES public.ticket_forms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ticket_code text,
  ADD COLUMN IF NOT EXISTS answers     jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Decisión confirmada: que una plantilla exija creadora o no lo define
-- creator_mode, así que la columna deja de ser obligatoria a nivel tabla.
-- Los tickets existentes ya tienen creator_id, no se pierde nada.
ALTER TABLE public.tickets ALTER COLUMN creator_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_ticket_code_key
  ON public.tickets (ticket_code) WHERE ticket_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS tickets_form_id_idx ON public.tickets (form_id);

COMMENT ON COLUMN public.tickets.ticket_code IS
  'Código visible tipo TK-0001, entregado por next_ticket_code(). NULL en los tickets creados antes de las plantillas.';
COMMENT ON COLUMN public.tickets.answers IS
  'Respuestas de los campos propios de la plantilla, por field_key. Las columnas reales (title/priority/...) se llenan vía ticket_form_fields.maps_to.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. CONSECUTIVO ATÓMICO
-- ───────────────────────────────────────────────────────────────────────────
-- lpad rellena pero no trunca: en el ticket 10.000 el código pasa solo a
-- TK-10000 y la secuencia sigue al infinito sin reiniciarse.
CREATE OR REPLACE FUNCTION public.next_ticket_code(p_form_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn1$
DECLARE
  v_prefix text;
  v_num    integer;
BEGIN
  -- UPDATE .. RETURNING toma el lock de la fila: dos creaciones simultáneas se
  -- serializan y cada una se lleva un número distinto.
  UPDATE public.ticket_forms
     SET next_number = next_number + 1
   WHERE id = p_form_id
  RETURNING code_prefix, next_number - 1 INTO v_prefix, v_num;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Plantilla de ticket inexistente: %', p_form_id;
  END IF;

  RETURN v_prefix || '-' || lpad(v_num::text, 4, '0');
END;
$fn1$;

REVOKE ALL ON FUNCTION public.next_ticket_code(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.next_ticket_code(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.next_ticket_code(uuid) IS
  'Entrega el próximo código de una plantilla (TK-0001, TK-0002, …) incrementando el contador de forma atómica.';

-- ───────────────────────────────────────────────────────────────────────────
-- 5. CREAR TICKET DESDE UNA PLANTILLA (código + validación + insert, atómico)
-- ───────────────────────────────────────────────────────────────────────────
-- En una sola transacción para que no queden huecos en la numeración si el
-- insert falla, y para que la validación de campos obligatorios no se pueda
-- saltear desde el cliente.
CREATE OR REPLACE FUNCTION public.create_ticket_from_form(
  p_form_id    uuid,
  p_answers    jsonb,
  p_creator_id uuid DEFAULT NULL
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn2$
DECLARE
  v_form   public.ticket_forms;
  v_field  public.ticket_form_fields;
  v_code     text;
  v_ticket   public.tickets;
  v_val      jsonb;
  v_core     jsonb := '{}'::jsonb;
  v_title    text;
  v_priority text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere sesión para crear un ticket';
  END IF;

  IF NOT public.has_permission(auth.uid(), 'Tickets', 'Crear Ticket') THEN
    RAISE EXCEPTION 'Sin permiso para crear tickets';
  END IF;

  SELECT * INTO v_form FROM public.ticket_forms WHERE id = p_form_id;
  IF v_form.id IS NULL THEN
    RAISE EXCEPTION 'Plantilla de ticket inexistente: %', p_form_id;
  END IF;
  IF NOT v_form.is_published OR v_form.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'La plantilla "%" no está publicada', v_form.name;
  END IF;

  -- Creadora según lo que declare la plantilla.
  IF v_form.creator_mode = 'required' AND p_creator_id IS NULL THEN
    RAISE EXCEPTION 'La plantilla "%" exige una creadora', v_form.name;
  END IF;
  IF v_form.creator_mode = 'none' THEN
    p_creator_id := NULL;
  END IF;

  -- Campos obligatorios + recolección de los que alimentan columnas reales.
  FOR v_field IN
    SELECT * FROM public.ticket_form_fields WHERE form_id = p_form_id ORDER BY position
  LOOP
    v_val := p_answers -> v_field.field_key;

    IF v_field.is_required AND (
         v_val IS NULL
      OR v_val = 'null'::jsonb
      OR (jsonb_typeof(v_val) = 'string' AND btrim(v_val #>> '{}') = '')
      OR (jsonb_typeof(v_val) = 'array'  AND jsonb_array_length(v_val) = 0)
    ) THEN
      RAISE EXCEPTION 'El campo "%" es obligatorio', v_field.label;
    END IF;

    IF v_field.maps_to IS NOT NULL AND v_val IS NOT NULL THEN
      v_core := v_core || jsonb_build_object(v_field.maps_to, v_val);
    END IF;
  END LOOP;

  -- Título legible: el campo mapeado si existe; si no, el nombre de la creadora
  -- (que es como el equipo identifica el caso hoy); si no, la plantilla.
  IF NULLIF(btrim(COALESCE(v_core #>> '{title}', '')), '') IS NULL THEN
    IF p_creator_id IS NOT NULL THEN
      SELECT COALESCE(NULLIF(btrim(c.artistic_name), ''), c.name)
        INTO v_title FROM public.creators c WHERE c.id = p_creator_id;
    END IF;
    v_title := COALESCE(NULLIF(btrim(COALESCE(v_title, '')), ''), v_form.name);
  ELSE
    v_title := btrim(v_core #>> '{title}');
  END IF;

  -- Un formulario mal armado (etiqueta en vez de valor) no debe corromper la
  -- columna priority, de la que dependen los filtros y el kanban.
  v_priority := lower(btrim(COALESCE(v_core #>> '{priority}', '')));
  IF v_priority NOT IN ('low', 'medium', 'high', 'urgent') THEN
    v_priority := 'medium';
  END IF;

  v_code := public.next_ticket_code(p_form_id);

  INSERT INTO public.tickets (
    form_id, ticket_code, creator_id, answers,
    title, description, priority, assigned_to, company, creator_notes,
    ticket_type, status
  )
  VALUES (
    p_form_id,
    v_code,
    p_creator_id,
    COALESCE(p_answers, '{}'::jsonb),
    v_title,
    NULLIF(btrim(COALESCE(v_core #>> '{description}', '')), ''),
    v_priority,
    NULLIF(btrim(COALESCE(v_core #>> '{assigned_to}', '')), ''),
    NULLIF(btrim(COALESCE(v_core #>> '{company}', '')), ''),
    NULLIF(btrim(COALESCE(v_core #>> '{creator_notes}', '')), ''),
    'general',
    'open'
  )
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END;
$fn2$;

REVOKE ALL ON FUNCTION public.create_ticket_from_form(uuid, jsonb, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_ticket_from_form(uuid, jsonb, uuid) TO authenticated;

COMMENT ON FUNCTION public.create_ticket_from_form(uuid, jsonb, uuid) IS
  'Crea un ticket desde una plantilla: valida permiso y campos obligatorios, asigna el consecutivo y hace el insert, todo en una transacción. Gateada con el MISMO permiso que muestra el botón en la UI (Tickets / Crear Ticket).';

-- ───────────────────────────────────────────────────────────────────────────
-- 6. RLS
-- ───────────────────────────────────────────────────────────────────────────
-- Las plantillas las LEE cualquier autenticado (necesita ver las tarjetas para
-- levantar un ticket); ESCRIBIRLAS exige el permiso nuevo "Gestionar
-- Plantillas", configurable por rol desde Administración → Roles.
-- Nota: no se toca la policy de `tickets`. Su alcance ("todos los autenticados
-- ven todo") fue una decisión explícita en 20260618040000_tickets_lock_anon.sql
-- y quedó diferida a la auditoría de permisos; cambiarla acá sería un cambio de
-- seguridad encubierto dentro de un feature.

ALTER TABLE public.ticket_forms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_form_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_forms_select ON public.ticket_forms;
CREATE POLICY ticket_forms_select ON public.ticket_forms
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'Tickets'));

DROP POLICY IF EXISTS ticket_forms_write ON public.ticket_forms;
CREATE POLICY ticket_forms_write ON public.ticket_forms
  FOR ALL TO authenticated
  USING      (public.can_use_module_function(auth.uid(), 'Tickets', 'Gestionar Plantillas', 'supervisor_or_above'))
  WITH CHECK (public.can_use_module_function(auth.uid(), 'Tickets', 'Gestionar Plantillas', 'supervisor_or_above'));

DROP POLICY IF EXISTS ticket_form_fields_select ON public.ticket_form_fields;
CREATE POLICY ticket_form_fields_select ON public.ticket_form_fields
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'Tickets'));

DROP POLICY IF EXISTS ticket_form_fields_write ON public.ticket_form_fields;
CREATE POLICY ticket_form_fields_write ON public.ticket_form_fields
  FOR ALL TO authenticated
  USING      (public.can_use_module_function(auth.uid(), 'Tickets', 'Gestionar Plantillas', 'supervisor_or_above'))
  WITH CHECK (public.can_use_module_function(auth.uid(), 'Tickets', 'Gestionar Plantillas', 'supervisor_or_above'));

-- ───────────────────────────────────────────────────────────────────────────
-- 7. PLANTILLA SEMILLA: "Escalamiento Queja/Solicitud" — nombre copiado de la
--    hoja original (ESCALAMIENTO QUEJA/SOLICITUD v3), sin el sufijo de version.
-- ───────────────────────────────────────────────────────────────────────────
-- Sirve de ejemplo para que el equipo arme las suyas.
-- Los 13 campos del correo actual, en el mismo orden (los otros 3 datos del
-- correo son automaticos o el selector de creadora).
-- next_number = 160 continúa donde quedó la hoja (el último fue TK-0159).
-- Queda SIN publicar: se revisa desde la UI y se publica cuando esté validada.
INSERT INTO public.ticket_forms
  (name, description, code_prefix, icon, color, creator_mode, next_number, is_published, position)
SELECT
  'Escalamiento Queja/Solicitud',
  'Escalamiento de quejas y solicitudes de creadoras. Port del formulario de la hoja ESCALAMIENTO QUEJA/SOLICITUD v3.',
  'TK', 'LifeBuoy', 'red', 'required', 160, false, 0
WHERE NOT EXISTS (SELECT 1 FROM public.ticket_forms WHERE upper(code_prefix) = 'TK');

INSERT INTO public.ticket_form_fields
  (form_id, label, field_key, field_type, is_required, options, maps_to, position)
SELECT f.id, d.label, d.field_key, d.field_type, d.is_required, d.options, d.maps_to, d.position
FROM public.ticket_forms f
CROSS JOIN (VALUES
  -- La creadora NO va como campo: creator_mode='required' hace que el renderer
  -- pinte el selector arriba del formulario.
  ('Link de Instagram',               'link_instagram',        'instagram',   false, '[]'::jsonb, NULL,          20),
  ('Pais de CC',                      'pais_cc',               'text',        false, '[]'::jsonb, NULL,          30),
  ('Solicitado Por',                  'solicitado_por',        'user',        true,  '[]'::jsonb, NULL,          40),
  ('Fecha de Escalamiento',           'fecha_escalamiento',    'date',        true,  '[]'::jsonb, NULL,          50),
  ('Fecha de Inicio con la Agencia',  'fecha_inicio_agencia',  'date',        false, '[]'::jsonb, NULL,          60),
  -- Sin maps_to a `company`: los valores del catálogo COMPANIES del front son
  -- otros (kash_agency, ora_miami…), así que escribir "Kash Plus" ahí dejaría
  -- el filtro de compañía sin resolver. Queda en answers.
  ('Agencia Involucrada',             'agencia_involucrada',   'select',      true,
     '["Kash Plus","Kash Massive","Picklink","Exchange","Ora Miami","Alvaroletshoot"]'::jsonb, NULL,            70),
  ('Facturación Mes Anterior',        'facturacion_anterior',  'currency',    false, '[]'::jsonb, NULL,          80),
  ('Facturación Actual',              'facturacion_actual',    'currency',    false, '[]'::jsonb, NULL,          90),
  ('Porcentaje al que se Cerró',      'porcentaje_cierre',     'percent',     false, '[]'::jsonb, NULL,         100),
  -- value/label: la columna priority solo entiende low|medium|high|urgent.
  ('Prioridad',                       'prioridad',             'select',      true,
     '[{"value":"low","label":"Baja"},{"value":"medium","label":"Media"},{"value":"high","label":"Alta"},{"value":"urgent","label":"Muy alta"}]'::jsonb,
     'priority',                                                                                               110),
  ('Tipo de Problema',                'tipo_problema',         'multiselect', true,
     '["Chats","Disminución de ventas","Actitud","Queja con el servicio","Filtración de contenido","Amenaza con retirarse","Solicita retiro inmediato","Uso de Contenido restringido","Cobro","Otro"]'::jsonb, NULL, 120),
  ('Descripción del Problema',        'descripcion_problema',  'textarea',    true,  '[]'::jsonb, 'description', 130),
  ('Pruebas Adjuntas',                'pruebas_adjuntas',      'drive_links', false, '[]'::jsonb, NULL,         140)
) AS d(label, field_key, field_type, is_required, options, maps_to, position)
WHERE upper(f.code_prefix) = 'TK'
  AND NOT EXISTS (SELECT 1 FROM public.ticket_form_fields x WHERE x.form_id = f.id);
