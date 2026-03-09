-- Create calls table for tracking video/audio call events
CREATE TABLE IF NOT EXISTS public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES auth.users(id),
  receiver_id uuid REFERENCES auth.users(id),
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  call_status text NOT NULL DEFAULT 'ringing',
  call_type text NOT NULL DEFAULT 'video',
  is_group boolean NOT NULL DEFAULT false,
  room_id text NOT NULL,
  start_time timestamptz,
  end_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create call_participants table for group calls
CREATE TABLE IF NOT EXISTS public.call_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'ringing',
  joined_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;

-- RLS policies for calls
CREATE POLICY "Users can view calls they participate in" ON public.calls
  FOR SELECT TO authenticated
  USING (caller_id = auth.uid() OR receiver_id = auth.uid() OR id IN (
    SELECT call_id FROM public.call_participants WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create calls" ON public.calls
  FOR INSERT TO authenticated
  WITH CHECK (caller_id = auth.uid());

CREATE POLICY "Participants can update calls" ON public.calls
  FOR UPDATE TO authenticated
  USING (caller_id = auth.uid() OR receiver_id = auth.uid() OR id IN (
    SELECT call_id FROM public.call_participants WHERE user_id = auth.uid()
  ));

-- RLS policies for call_participants
CREATE POLICY "Users can view their call participations" ON public.call_participants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR call_id IN (
    SELECT id FROM public.calls WHERE caller_id = auth.uid()
  ));

CREATE POLICY "Call creators can insert participants" ON public.call_participants
  FOR INSERT TO authenticated
  WITH CHECK (call_id IN (SELECT id FROM public.calls WHERE caller_id = auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Users can update their own participation" ON public.call_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR call_id IN (
    SELECT id FROM public.calls WHERE caller_id = auth.uid()
  ));

CREATE POLICY "Call creators can delete participants" ON public.call_participants
  FOR DELETE TO authenticated
  USING (call_id IN (SELECT id FROM public.calls WHERE caller_id = auth.uid()));

-- Add calls to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;