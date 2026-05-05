
-- Clean all chat data in correct FK order
TRUNCATE chat_reactions, chat_read_receipts, chat_pinned, chat_space_conversations, chat_messages, chat_participants, chat_conversations CASCADE;
