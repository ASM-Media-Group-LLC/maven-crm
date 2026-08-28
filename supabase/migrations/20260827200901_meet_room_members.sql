CREATE TABLE IF NOT EXISTS public.meet_room_members (
  meet_room_id uuid NOT NULL REFERENCES public.meet_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  pinned boolean NOT NULL DEFAULT false,
  sort_order integer,
  PRIMARY KEY (meet_room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meet_room_members_user
  ON public.meet_room_members(user_id, pinned DESC, sort_order NULLS LAST, joined_at DESC);

ALTER TABLE public.meet_room_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own meet memberships" ON public.meet_room_members;
CREATE POLICY "Own meet memberships"
  ON public.meet_room_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Members see meet rooms" ON public.meet_rooms;
CREATE POLICY "Members see meet rooms"
  ON public.meet_rooms FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.meet_room_members m
    WHERE m.meet_room_id = meet_rooms.id AND m.user_id = auth.uid()
  ));

INSERT INTO public.meet_room_members (meet_room_id, user_id, joined_at)
SELECT id, created_by, created_at FROM public.meet_rooms
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.meet_room_members IS
  'Quien tiene una reunion de Meet en SU lista. El creador entra al crearla y los demas al canjear el codigo o abrir el link, asi la reunion les queda a mano con el nombre que le puso el anfitrion. pinned/sort_order son por persona.';
