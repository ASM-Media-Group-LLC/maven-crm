-- 20260510110000_chatter_messages_edit_history.sql
--
-- Adds edit history tracking to chatter_messages so the examiner can
-- correct typos / re-word a sent message without losing the audit
-- trail. The chatter sees a small "(editado)" tag below an edited
-- bubble; the examiner can additionally click the tag to inspect the
-- list of prior versions.
--
-- Schema:
--   - edited_at      timestamptz — null for never-edited messages,
--                                  bumped on every edit.
--   - content_history jsonb     — array of {content, edited_at}; we
--                                  push the OLD content + OLD
--                                  edited_at right BEFORE applying
--                                  the new content. Newest entry is
--                                  the most-recent prior version, so
--                                  history[0] = the version right
--                                  before the current one.

ALTER TABLE public.chatter_messages
  ADD COLUMN IF NOT EXISTS edited_at       timestamptz,
  ADD COLUMN IF NOT EXISTS content_history jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS chatter_messages_edited_at_idx
  ON public.chatter_messages (edited_at)
  WHERE edited_at IS NOT NULL;
