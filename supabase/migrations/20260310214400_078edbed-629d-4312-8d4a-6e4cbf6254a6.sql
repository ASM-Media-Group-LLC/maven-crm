-- Set FULL replica identity on all chat tables so Supabase Realtime
-- can evaluate RLS policies for UPDATE and DELETE events.
-- Without this, conversation_id / message_id are missing from old rows,
-- causing RLS checks to fail and events to be silently dropped.

ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.chat_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.chat_participants REPLICA IDENTITY FULL;
ALTER TABLE public.chat_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.chat_read_receipts REPLICA IDENTITY FULL;
ALTER TABLE public.calls REPLICA IDENTITY FULL;
ALTER TABLE public.call_participants REPLICA IDENTITY FULL;