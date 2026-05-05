
-- ============================================
-- CHAT MODULE: Core tables for real-time messaging
-- ============================================

-- 1. Conversations table
CREATE TABLE public.chat_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  name text,
  description text,
  avatar_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

-- 2. Conversation participants
CREATE TABLE public.chat_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  is_muted boolean NOT NULL DEFAULT false,
  notifications_mode text NOT NULL DEFAULT 'all' CHECK (notifications_mode IN ('all', 'mentions', 'none')),
  UNIQUE (conversation_id, user_id)
);

ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;

-- 3. Messages table
CREATE TABLE public.chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text,
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image', 'file', 'system')),
  file_url text,
  file_name text,
  file_size bigint,
  reply_to_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_edited boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 4. Read receipts
CREATE TABLE public.chat_read_receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

ALTER TABLE public.chat_read_receipts ENABLE ROW LEVEL SECURITY;

-- 5. Message reactions
CREATE TABLE public.chat_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Security definer function for participant check
-- ============================================
CREATE OR REPLACE FUNCTION public.is_chat_participant(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE user_id = _user_id AND conversation_id = _conversation_id
  )
$$;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Conversations: users can see conversations they participate in
CREATE POLICY "Users can view their conversations"
  ON public.chat_conversations FOR SELECT
  USING (public.is_chat_participant(auth.uid(), id));

CREATE POLICY "Authenticated users can create conversations"
  ON public.chat_conversations FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can update group conversations"
  ON public.chat_conversations FOR UPDATE
  USING (public.is_chat_participant(auth.uid(), id));

CREATE POLICY "Admins can delete conversations"
  ON public.chat_conversations FOR DELETE
  USING (auth.uid() = created_by);

-- Participants: users can see participants of their conversations
CREATE POLICY "Users can view participants of their conversations"
  ON public.chat_participants FOR SELECT
  USING (public.is_chat_participant(auth.uid(), conversation_id));

CREATE POLICY "Users can add participants"
  ON public.chat_participants FOR INSERT
  WITH CHECK (public.is_chat_participant(auth.uid(), conversation_id) OR auth.uid() = user_id);

CREATE POLICY "Users can update their own participation"
  ON public.chat_participants FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can remove participants"
  ON public.chat_participants FOR DELETE
  USING (public.is_chat_participant(auth.uid(), conversation_id));

-- Messages: users can see messages in their conversations
CREATE POLICY "Users can view messages in their conversations"
  ON public.chat_messages FOR SELECT
  USING (public.is_chat_participant(auth.uid(), conversation_id));

CREATE POLICY "Users can send messages to their conversations"
  ON public.chat_messages FOR INSERT
  WITH CHECK (public.is_chat_participant(auth.uid(), conversation_id) AND auth.uid() = sender_id);

CREATE POLICY "Users can update their own messages"
  ON public.chat_messages FOR UPDATE
  USING (auth.uid() = sender_id);

CREATE POLICY "Users can delete their own messages"
  ON public.chat_messages FOR DELETE
  USING (auth.uid() = sender_id);

-- Read receipts
CREATE POLICY "Users can view read receipts in their conversations"
  ON public.chat_read_receipts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.chat_messages m
    WHERE m.id = message_id AND public.is_chat_participant(auth.uid(), m.conversation_id)
  ));

CREATE POLICY "Users can mark messages as read"
  ON public.chat_read_receipts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Reactions
CREATE POLICY "Users can view reactions in their conversations"
  ON public.chat_reactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.chat_messages m
    WHERE m.id = message_id AND public.is_chat_participant(auth.uid(), m.conversation_id)
  ));

CREATE POLICY "Users can add reactions"
  ON public.chat_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.chat_messages m
    WHERE m.id = message_id AND public.is_chat_participant(auth.uid(), m.conversation_id)
  ));

CREATE POLICY "Users can remove their reactions"
  ON public.chat_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX idx_chat_participants_user ON public.chat_participants(user_id);
CREATE INDEX idx_chat_participants_conversation ON public.chat_participants(conversation_id);
CREATE INDEX idx_chat_messages_conversation ON public.chat_messages(conversation_id, created_at DESC);
CREATE INDEX idx_chat_messages_sender ON public.chat_messages(sender_id);
CREATE INDEX idx_chat_read_receipts_message ON public.chat_read_receipts(message_id);
CREATE INDEX idx_chat_reactions_message ON public.chat_reactions(message_id);

-- ============================================
-- Updated_at triggers
-- ============================================
CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_messages_updated_at
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Enable Realtime on messages and participants
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participants;

-- ============================================
-- Storage bucket for chat files
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-files', 'chat-files', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload chat files" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'chat-files' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Chat files are publicly accessible" ON storage.objects;
CREATE POLICY "Chat files are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-files');

DROP POLICY IF EXISTS "Users can delete their own chat files" ON storage.objects;
CREATE POLICY "Users can delete their own chat files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'chat-files' AND auth.uid()::text = (storage.foldername(name))[1]);
