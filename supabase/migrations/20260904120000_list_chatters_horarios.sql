-- "Agregar chatter" en Horarios: solo quienes tienen rol Chatter o Chatter
-- Supervisor en Maven (mas el legacy 'agent'), y ya tienen identidad de
-- chatter (los miembros del grupo referencian chatter_identity).
-- SECURITY DEFINER porque user_roles solo lo lee admin o el propio.
CREATE OR REPLACE FUNCTION public.list_chatters_horarios()
RETURNS TABLE (id uuid, display_name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (i.id) i.id, i.display_name, ur.role::text
  FROM public.chatter_identity i
  JOIN public.user_roles ur ON ur.user_id = i.maven_user_id
  WHERE ur.role::text IN ('Chatter', 'Chatter Supervisor', 'agent')
    AND i.active
    AND public.chatter_horarios_supervisa(auth.uid())
  ORDER BY i.id, ur.role
$$;
REVOKE ALL ON FUNCTION public.list_chatters_horarios() FROM public;
GRANT EXECUTE ON FUNCTION public.list_chatters_horarios() TO authenticated;
