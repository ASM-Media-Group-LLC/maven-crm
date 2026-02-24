
CREATE TABLE public.creator_chatter_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  chatter_profile_id uuid NOT NULL,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid,
  is_active boolean DEFAULT true,
  UNIQUE(creator_id, chatter_profile_id)
);

ALTER TABLE public.creator_chatter_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage creator_chatter_assignments"
  ON public.creator_chatter_assignments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
