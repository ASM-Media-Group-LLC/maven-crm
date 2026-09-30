-- DRIVE · cupo por persona.
--
-- Jhon, 28/09: cupo por persona con un valor general que el admin pueda subir
-- a alguien puntual, y la barrita de «usaste X de Y». Sin cupo, una sola
-- persona podía llenar el NAS de toda la oficina.
--
-- Qué cuenta: TODO lo que la persona tiene en el Drive, incluida la papelera
-- (sigue ocupando lugar en el NAS hasta borrarla para siempre, igual que en
-- Google) y lo que se está subiendo (ya reservó su lugar).
--
-- El valor general es 50 GB. drive_cupos guarda SOLO las excepciones.

CREATE TABLE public.drive_cupos (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id),
  bytes_max  bigint NOT NULL CHECK (bytes_max >= 0),
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.drive_cupo_por_defecto()
RETURNS bigint LANGUAGE sql IMMUTABLE AS $$ SELECT 50::bigint * 1024 * 1024 * 1024 $$;

-- ¿Es admin de la agencia en la que estoy? (el admin de una agencia no toca
-- los cupos de otra).
CREATE OR REPLACE FUNCTION public.drive_soy_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- ¿Esa persona es de MI agencia? SECURITY DEFINER porque tenant_members solo
-- le muestra a cada uno SU fila: dentro de la política, un EXISTS directo no
-- veía a la otra persona y el admin no podía guardar ningún cupo (lo encontró
-- la prueba contra prod del 29/09).
CREATE OR REPLACE FUNCTION public.drive_es_de_mi_agencia(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.user_id = p_user AND m.tenant_id = public.current_tenant_id())
$$;

ALTER TABLE public.drive_cupos ENABLE ROW LEVEL SECURITY;

CREATE POLICY drive_cupos_ver ON public.drive_cupos FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
    OR ((SELECT public.drive_soy_admin()) AND tenant_id = (SELECT public.current_tenant_id())));

CREATE POLICY drive_cupos_admin ON public.drive_cupos FOR ALL TO authenticated
  USING ((SELECT public.drive_soy_admin()) AND tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (
    (SELECT public.drive_soy_admin()) AND tenant_id = (SELECT public.current_tenant_id())
    -- ⚠️ Y la persona tiene que ser de ESA agencia: sin esto un admin podía
    -- escribir el cupo de alguien de otra agencia poniendo su propio tenant.
    AND public.drive_es_de_mi_agencia(user_id)
  );

-- Cuánto usa y cuánto tiene una persona. La propia, o cualquiera de la agencia
-- si quien pregunta es admin.
CREATE OR REPLACE FUNCTION public.drive_uso(p_user uuid DEFAULT NULL)
RETURNS TABLE (usado bigint, cupo bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  quien uuid := coalesce(p_user, auth.uid());
BEGIN
  IF quien <> auth.uid() AND NOT (
    public.drive_soy_admin()
    AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.user_id = quien AND m.tenant_id = public.current_tenant_id())
  ) THEN
    RAISE EXCEPTION 'No podés ver el uso de otra persona' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    coalesce((SELECT sum(i.size) FROM public.drive_items i WHERE i.owner_id = quien AND i.tipo = 'archivo'), 0)::bigint,
    coalesce((SELECT c.bytes_max FROM public.drive_cupos c WHERE c.user_id = quien), public.drive_cupo_por_defecto());
END;
$$;

-- Para el admin: todas las personas de su agencia, con su uso y su cupo.
CREATE OR REPLACE FUNCTION public.drive_usos_de_mi_agencia()
RETURNS TABLE (user_id uuid, nombre text, usado bigint, cupo bigint, cupo_propio boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.drive_soy_admin() THEN
    RAISE EXCEPTION 'Solo para admins' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.user_id,
         coalesce(p.full_name, ''),
         coalesce((SELECT sum(i.size) FROM public.drive_items i WHERE i.owner_id = m.user_id AND i.tipo = 'archivo'), 0)::bigint,
         coalesce(c.bytes_max, public.drive_cupo_por_defecto()),
         c.user_id IS NOT NULL
  FROM public.tenant_members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN public.drive_cupos c ON c.user_id = m.user_id
  WHERE m.tenant_id = public.current_tenant_id()
  ORDER BY 3 DESC, 2;
END;
$$;

REVOKE ALL ON FUNCTION public.drive_uso(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.drive_usos_de_mi_agencia() FROM public, anon;
REVOKE ALL ON FUNCTION public.drive_soy_admin() FROM public, anon;
REVOKE ALL ON FUNCTION public.drive_es_de_mi_agencia(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.drive_es_de_mi_agencia(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.drive_uso(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.drive_usos_de_mi_agencia() TO authenticated;
GRANT EXECUTE ON FUNCTION public.drive_soy_admin() TO authenticated;

COMMENT ON TABLE public.drive_cupos IS
  'Cupo del Drive por persona: SOLO las excepciones. El resto tiene drive_cupo_por_defecto() (50 GB). Lo edita un admin de la misma agencia.';
