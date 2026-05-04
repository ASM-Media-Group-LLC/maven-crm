
-- Part 1: Add project_type to events
ALTER TABLE public.events ADD COLUMN project_type text;

-- Part 2: Agenda share tokens table
CREATE TABLE public.agenda_share_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE public.agenda_share_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own tokens"
  ON public.agenda_share_tokens FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can view own tokens"
  ON public.agenda_share_tokens FOR SELECT
  USING (auth.uid() = created_by);

-- Part 3: RPC function for public agenda
CREATE OR REPLACE FUNCTION public.get_agenda_by_share_token(p_token uuid)
RETURNS TABLE(
  id uuid,
  name text,
  event_type text,
  project_type text,
  date date,
  start_time time,
  end_time time,
  location text,
  description text,
  status text,
  guests jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
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
  WHERE e.date >= CURRENT_DATE
  ORDER BY e.date, e.start_time;
END;
$$;
