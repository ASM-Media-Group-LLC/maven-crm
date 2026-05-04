-- Create a SECURITY DEFINER function to check call participation without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.is_call_participant(_user_id uuid, _call_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.call_participants
    WHERE user_id = _user_id AND call_id = _call_id
  )
$$;

-- Create a helper to check if user is call creator
CREATE OR REPLACE FUNCTION public.is_call_creator(_user_id uuid, _call_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.calls
    WHERE id = _call_id AND caller_id = _user_id
  )
$$;

-- Drop existing recursive policies on calls
DROP POLICY IF EXISTS "Users can view calls they participate in" ON calls;
DROP POLICY IF EXISTS "Participants can update calls" ON calls;

-- Recreate without recursion using the security definer function
CREATE POLICY "Users can view calls they participate in"
ON calls FOR SELECT TO authenticated
USING (
  caller_id = auth.uid()
  OR receiver_id = auth.uid()
  OR public.is_call_participant(auth.uid(), id)
);

CREATE POLICY "Participants can update calls"
ON calls FOR UPDATE TO authenticated
USING (
  caller_id = auth.uid()
  OR receiver_id = auth.uid()
  OR public.is_call_participant(auth.uid(), id)
);

-- Drop existing recursive policies on call_participants
DROP POLICY IF EXISTS "Users can view their call participations" ON call_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON call_participants;
DROP POLICY IF EXISTS "Call creators can insert participants" ON call_participants;
DROP POLICY IF EXISTS "Call creators can delete participants" ON call_participants;

-- Recreate call_participants policies without recursion
CREATE POLICY "Users can view their call participations"
ON call_participants FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_call_creator(auth.uid(), call_id)
);

CREATE POLICY "Users can update their own participation"
ON call_participants FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_call_creator(auth.uid(), call_id)
);

CREATE POLICY "Call creators can insert participants"
ON call_participants FOR INSERT TO authenticated
WITH CHECK (
  public.is_call_creator(auth.uid(), call_id)
  OR user_id = auth.uid()
);

CREATE POLICY "Call creators can delete participants"
ON call_participants FOR DELETE TO authenticated
USING (
  public.is_call_creator(auth.uid(), call_id)
);