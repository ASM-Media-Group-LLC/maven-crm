-- LeadGen: leadgen_entries tenía RLS abierta (una policy qual=true) y el recorte
-- 'self' era CLIENT-SIDE (LeadGenContent filtra lg_user_id=uid para roles con
-- data_scope='self'). O sea: en la pantalla un closer/LLG ya ve solo lo suyo,
-- pero por API directa (anon key + SDK) podía bajarse los ~102k leads del equipo
-- (handles, teléfonos, OF urls). Este fix cierra ese atajo SIN cambiar lo que se
-- ve en la pantalla: enforce server-side lo que el front ya hace.
--
--   · Admin / rol SIN data_scope='self' en LeadGen → ve todo (igual que hoy)
--   · Rol CON data_scope='self' (closer, LLG)       → solo sus leads (lg_user_id=uid)
CREATE OR REPLACE FUNCTION public.has_leadgen_global_scope(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_in_role_group(_user_id, 'admin')
    OR NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id AND rp.module = 'LeadGen'
        AND rp.submodule IS NULL AND rp.data_scope = 'self'
    );
$$;
GRANT EXECUTE ON FUNCTION public.has_leadgen_global_scope(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS leadgen_entries_scope_select ON public.leadgen_entries;
CREATE POLICY leadgen_entries_scope_select ON public.leadgen_entries
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_leadgen_global_scope(auth.uid()) OR lg_user_id = auth.uid());
