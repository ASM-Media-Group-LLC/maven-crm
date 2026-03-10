
-- Spaces table (like Google Chat spaces)
CREATE TABLE public.chat_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text DEFAULT '💬',
  color text DEFAULT '#6366f1',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  sort_order int DEFAULT 0
);

ALTER TABLE public.chat_spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own spaces"
  ON public.chat_spaces FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Space-conversation assignments
CREATE TABLE public.chat_space_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.chat_spaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  sort_order int DEFAULT 0,
  UNIQUE(space_id, conversation_id)
);

ALTER TABLE public.chat_space_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage space conversations via space ownership"
  ON public.chat_space_conversations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_spaces WHERE id = space_id AND created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.chat_spaces WHERE id = space_id AND created_by = auth.uid()));

-- Pinned chats
CREATE TABLE public.chat_pinned (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  pinned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, conversation_id)
);

ALTER TABLE public.chat_pinned ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own pins"
  ON public.chat_pinned FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Set replica identity for realtime
ALTER TABLE public.chat_spaces REPLICA IDENTITY FULL;
ALTER TABLE public.chat_space_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.chat_pinned REPLICA IDENTITY FULL;
