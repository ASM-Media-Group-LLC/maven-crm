-- ============================================================================
-- Chatter Evaluator: examiner emoji bar (shared, persisted)
-- ============================================================================
-- Mirrors the original Roleplaychatters behavior: examiners see a shared
-- emoji bar above the chat composer. Add/remove from any examiner side
-- propagates to everyone (saved in chatter_config). The chatter side
-- intentionally keeps its bar in-memory only (same as original).

ALTER TABLE public.chatter_config
  ADD COLUMN IF NOT EXISTS examiner_emojis text[] NOT NULL
    DEFAULT ARRAY['😏','🔥','💦','😈','❤️','🥵','😍','🙈','🍆','💋'];

-- Allow anon SELECT of this new column too (chatter side uses it as
-- starting list; chatter_config_anon_read policy already covers the row).
-- No new policy needed.
