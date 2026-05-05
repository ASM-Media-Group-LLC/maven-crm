
CREATE OR REPLACE FUNCTION public.get_agenda_by_share_token(p_token uuid)
 RETURNS TABLE(id uuid, name text, event_type text, project_type text, date date, start_time time without time zone, end_time time without time zone, location text, description text, status text, guests jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate token exists and is not expired
  IF NOT EXISTS (
    SELECT 1 FROM agenda_share_tokens ast
    WHERE ast.token = p_token
    AND (ast.expires_at IS NULL OR ast.expires_at > now())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.event_type,
    e.project_type,
    e.date,
    e.start_time,
    e.end_time,
    e.location,
    e.description,
    e.status,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'guest_name', COALESCE(eg.guest_name, c.artistic_name, c.name),
        'guest_type', eg.guest_type,
        'status', eg.status,
        'profile_photo_url', c.profile_photo_url,
        'instagram_handle', c.instagram_handle
      ) ORDER BY eg.created_at)
      FROM event_guests eg
      LEFT JOIN creators c ON eg.creator_id = c.id
      WHERE eg.event_id = e.id),
      '[]'::jsonb
    ) as guests
  FROM events e
  WHERE e.date >= CURRENT_DATE - INTERVAL '90 days'
  ORDER BY e.date, e.start_time;
END;
$function$;
