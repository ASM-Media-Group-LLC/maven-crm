
-- ═══════════════════════════════════════════════════════════════
-- COWORK SESSIONS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.cowork_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  host_hub_livekit_room text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cowork_sessions ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- COWORK ROOMS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.cowork_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cowork_sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  livekit_room_name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cowork_rooms ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- COWORK MEMBERSHIPS (host | participant)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.cowork_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cowork_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'participant' CHECK (role IN ('host','participant')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

ALTER TABLE public.cowork_memberships ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- ROOM ASSIGNMENTS (user → room, 1 active per session)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.cowork_room_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cowork_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.cowork_rooms(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id),
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.cowork_room_assignments ENABLE ROW LEVEL SECURITY;

-- Ensure only 1 active assignment per user per session
CREATE UNIQUE INDEX idx_cowork_active_assignment 
  ON public.cowork_room_assignments(session_id, user_id) 
  WHERE is_active = true;

-- ═══════════════════════════════════════════════════════════════
-- HOST REQUESTS (participant asks for host attention)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.cowork_host_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cowork_sessions(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.cowork_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  acked_by uuid REFERENCES auth.users(id),
  resolved_by uuid REFERENCES auth.users(id),
  acked_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cowork_host_requests ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- SCREENSHARE REQUESTS (approval workflow)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.cowork_screenshare_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cowork_sessions(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.cowork_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','expired')),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cowork_screenshare_requests ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- HELPER: check if user is host in a session
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_cowork_host(_user_id uuid, _session_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cowork_memberships
    WHERE user_id = _user_id AND session_id = _session_id AND role = 'host'
  )
$$;

-- HELPER: check if user is member of session
CREATE OR REPLACE FUNCTION public.is_cowork_member(_user_id uuid, _session_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cowork_memberships
    WHERE user_id = _user_id AND session_id = _session_id
  )
$$;

-- HELPER: get user's active room in session
CREATE OR REPLACE FUNCTION public.get_cowork_user_room(_user_id uuid, _session_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT room_id FROM public.cowork_room_assignments
  WHERE user_id = _user_id AND session_id = _session_id AND is_active = true
  LIMIT 1
$$;

-- ═══════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

-- cowork_sessions: members can read their session
CREATE POLICY "Members can view their session"
  ON public.cowork_sessions FOR SELECT TO authenticated
  USING (public.is_cowork_member(auth.uid(), id));

CREATE POLICY "Hosts can update session"
  ON public.cowork_sessions FOR UPDATE TO authenticated
  USING (public.is_cowork_host(auth.uid(), id));

-- cowork_rooms: members can see rooms in their session; participants only their assigned room
CREATE POLICY "Hosts see all rooms"
  ON public.cowork_rooms FOR SELECT TO authenticated
  USING (public.is_cowork_host(auth.uid(), session_id));

CREATE POLICY "Participants see their assigned room"
  ON public.cowork_rooms FOR SELECT TO authenticated
  USING (
    id = public.get_cowork_user_room(auth.uid(), session_id)
  );

-- cowork_memberships: members can see memberships of their session
CREATE POLICY "Members see session memberships"
  ON public.cowork_memberships FOR SELECT TO authenticated
  USING (public.is_cowork_member(auth.uid(), session_id));

-- room_assignments: hosts see all; participants see own
CREATE POLICY "Hosts see all assignments"
  ON public.cowork_room_assignments FOR SELECT TO authenticated
  USING (public.is_cowork_host(auth.uid(), session_id));

CREATE POLICY "Participants see own assignment"
  ON public.cowork_room_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- host_requests: hosts see all in session; requester sees own
CREATE POLICY "Hosts see all host requests"
  ON public.cowork_host_requests FOR SELECT TO authenticated
  USING (public.is_cowork_host(auth.uid(), session_id));

CREATE POLICY "Users see own host requests"
  ON public.cowork_host_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Members can create host requests"
  ON public.cowork_host_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_cowork_member(auth.uid(), session_id) AND user_id = auth.uid());

-- screenshare_requests: hosts see all; requester sees own
CREATE POLICY "Hosts see all screenshare requests"
  ON public.cowork_screenshare_requests FOR SELECT TO authenticated
  USING (public.is_cowork_host(auth.uid(), session_id));

CREATE POLICY "Users see own screenshare requests"
  ON public.cowork_screenshare_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Members can create screenshare requests"
  ON public.cowork_screenshare_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_cowork_member(auth.uid(), session_id) AND user_id = auth.uid());

-- Enable REPLICA IDENTITY FULL for Realtime on key tables
ALTER TABLE public.cowork_host_requests REPLICA IDENTITY FULL;
ALTER TABLE public.cowork_screenshare_requests REPLICA IDENTITY FULL;
ALTER TABLE public.cowork_room_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.cowork_memberships REPLICA IDENTITY FULL;
ALTER TABLE public.cowork_rooms REPLICA IDENTITY FULL;

-- Trigger for updated_at on sessions
CREATE TRIGGER update_cowork_sessions_updated_at
  BEFORE UPDATE ON public.cowork_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
