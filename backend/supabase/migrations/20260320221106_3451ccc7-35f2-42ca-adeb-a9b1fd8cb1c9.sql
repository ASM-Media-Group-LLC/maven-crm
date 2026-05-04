
CREATE OR REPLACE FUNCTION public.get_closer_stage_counts(_user_id uuid, _is_admin boolean)
RETURNS TABLE(stage text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT cc.stage, COUNT(*) as cnt
  FROM public.closer_creators cc
  WHERE _is_admin OR cc.assigned_to = _user_id
  GROUP BY cc.stage;
$$;
