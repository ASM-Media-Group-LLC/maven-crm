-- CORREO · las etiquetas, como las maneja Gmail.
--
-- Jhon, 28/09: «necesito que quede igual que en gmail». Faltaba todo el menú
-- ⋮ de la etiqueta: color (paleta + personalizado, fondo y texto aparte),
-- mostrar / mostrar si no están leídas / ocultar en la columna, mostrar u
-- ocultar en la lista de mensajes, modificar, eliminar y subetiquetas.
--
-- ⚠️ EL COLOR DEJA DE SER UN TOKEN DEL TEMA
--
-- #1893 había decidido seis tokens (primary, accent…) para que nadie eligiera
-- algo ilegible. Gmail no hace eso: guarda DOS colores, fondo y texto, y los
-- dos salen de una lista cerrada. Se pasa a ese modelo. La columna `color`
-- vieja QUEDA (con su CHECK) para que el frontend anterior siga andando
-- mientras se despliega el nuevo; el nuevo no la lee. Borrarla es limpieza
-- para después.
--
-- Sin color = las dos columnas en NULL (el «Eliminar color» de Gmail). Van
-- juntas: una sin la otra no se puede dibujar.
--
-- ⚠️ SUBETIQUETAS POR parent_id, NO POR "/" EN EL NOMBRE
--
-- Gmail anida con el nombre ("Padre/Hijo"). Acá el nombre es solo el tramo
-- propio y el padre va por id: renombrar el padre no obliga a reescribir a
-- los hijos, y una barra escrita a mano («Hubstaff / reportes», que ya existe
-- en prod) no se convierte sola en un árbol.
--
-- Borrar el padre borra sus subetiquetas, igual que Gmail (ON DELETE CASCADE).
-- Los correos NO se tocan: solo pierden las etiquetas.

ALTER TABLE public.mail_labels
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.mail_labels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS bg_color text,
  ADD COLUMN IF NOT EXISTS text_color text,
  -- «En la lista de etiquetas»: Mostrar / Mostrar si no están leídas / Ocultar.
  ADD COLUMN IF NOT EXISTS en_lista_etiquetas text NOT NULL DEFAULT 'mostrar',
  -- «En la lista de mensajes»: Mostrar / Ocultar la pastilla junto al asunto.
  ADD COLUMN IF NOT EXISTS en_lista_mensajes boolean NOT NULL DEFAULT true;

ALTER TABLE public.mail_labels
  ADD CONSTRAINT mail_labels_en_lista_etiquetas_chk
    CHECK (en_lista_etiquetas IN ('mostrar', 'si_no_leidas', 'ocultar')),
  ADD CONSTRAINT mail_labels_hex_chk
    CHECK ((bg_color IS NULL OR bg_color ~ '^#[0-9a-f]{6}$')
       AND (text_color IS NULL OR text_color ~ '^#[0-9a-f]{6}$')),
  ADD CONSTRAINT mail_labels_color_par_chk
    CHECK ((bg_color IS NULL) = (text_color IS NULL)),
  ADD CONSTRAINT mail_labels_no_es_su_padre_chk
    CHECK (parent_id IS NULL OR parent_id <> id);

-- Gmail deja nombres de hasta 225 caracteres (antes eran 40, igual que acá).
ALTER TABLE public.mail_labels DROP CONSTRAINT IF EXISTS mail_labels_nombre_check;
ALTER TABLE public.mail_labels
  ADD CONSTRAINT mail_labels_nombre_check CHECK (length(btrim(nombre)) BETWEEN 1 AND 225);

-- El nombre es único DENTRO de su padre: «Reportes» puede estar bajo
-- «Hubstaff» y bajo «Pagos» a la vez. NULLS NOT DISTINCT para que dos de
-- primer nivel con el mismo nombre sigan chocando.
ALTER TABLE public.mail_labels DROP CONSTRAINT IF EXISTS mail_labels_user_id_nombre_key;
CREATE UNIQUE INDEX IF NOT EXISTS mail_labels_nombre_en_su_padre_key
  ON public.mail_labels (user_id, parent_id, nombre) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS mail_labels_parent_idx
  ON public.mail_labels (parent_id) WHERE parent_id IS NOT NULL;

-- Las que ya existen pasan al color de Gmail más parecido a su token, con
-- texto blanco como los colores vivos de Gmail.
UPDATE public.mail_labels SET
  bg_color = CASE color
    WHEN 'primary' THEN '#4a86e8'
    WHEN 'accent' THEN '#a479e2'
    WHEN 'success' THEN '#16a766'
    WHEN 'warning' THEN '#ffad47'
    WHEN 'destructive' THEN '#fb4c2f'
    ELSE '#999999'
  END,
  text_color = '#ffffff'
WHERE bg_color IS NULL;

-- ── El padre tiene que ser del MISMO buzón y no puede formar un ciclo ──────
-- La FK solo mira que el id exista: sin esto, alguien podría colgar su
-- etiqueta de la de otra persona (la RLS no mira la fila apuntada), o armar
-- A → B → A y dejar la columna en un bucle infinito.
CREATE OR REPLACE FUNCTION public.mail_labels_valida_padre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  actual uuid := NEW.parent_id;
  pasos int := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.mail_labels WHERE id = NEW.parent_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'La etiqueta madre no existe en este buzón' USING ERRCODE = '23503';
  END IF;
  WHILE actual IS NOT NULL LOOP
    IF actual = NEW.id THEN
      RAISE EXCEPTION 'Una etiqueta no puede quedar dentro de sí misma' USING ERRCODE = '23514';
    END IF;
    pasos := pasos + 1;
    IF pasos > 50 THEN
      RAISE EXCEPTION 'Demasiados niveles de subetiquetas' USING ERRCODE = '23514';
    END IF;
    SELECT parent_id INTO actual FROM public.mail_labels WHERE id = actual;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mail_labels_valida_padre ON public.mail_labels;
CREATE TRIGGER mail_labels_valida_padre
  BEFORE INSERT OR UPDATE OF parent_id, user_id ON public.mail_labels
  FOR EACH ROW EXECUTE FUNCTION public.mail_labels_valida_padre();

COMMENT ON COLUMN public.mail_labels.color IS
  'OBSOLETA desde 28/09 (la lee solo el frontend anterior). El color vive en bg_color/text_color.';
COMMENT ON COLUMN public.mail_labels.bg_color IS
  'Fondo de la etiqueta, hex de la paleta de Gmail. NULL junto con text_color = sin color.';
COMMENT ON COLUMN public.mail_labels.parent_id IS
  'Etiqueta madre (subetiquetas). Borrar la madre borra las hijas, como en Gmail.';
