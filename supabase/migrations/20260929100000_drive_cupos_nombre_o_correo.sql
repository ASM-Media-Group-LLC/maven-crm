-- DRIVE · en «Espacio por persona», quien no tiene nombre en su perfil
-- aparecía como «—» (3 personas el 29/09). Ahora cae al correo.
CREATE OR REPLACE FUNCTION public.drive_usos_de_mi_agencia()
RETURNS TABLE (user_id uuid, nombre text, usado bigint, cupo bigint, cupo_propio boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.drive_soy_admin() THEN
    RAISE EXCEPTION 'Solo para admins' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.user_id,
         coalesce(nullif(btrim(p.full_name), ''), u.email::text, ''),
         coalesce((SELECT sum(i.size) FROM public.drive_items i WHERE i.owner_id = m.user_id AND i.tipo = 'archivo'), 0)::bigint,
         coalesce(c.bytes_max, public.drive_cupo_por_defecto()),
         c.user_id IS NOT NULL
  FROM public.tenant_members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.drive_cupos c ON c.user_id = m.user_id
  WHERE m.tenant_id = public.current_tenant_id()
  ORDER BY 3 DESC, 2;
END;
$$;
