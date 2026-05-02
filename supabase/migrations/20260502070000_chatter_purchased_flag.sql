-- ============================================================================
-- Chatter Evaluator: PPV (pay-per-view) "purchased" flag on messages
-- ============================================================================
-- The original Roleplaychatters tracks per-message `purchased` state for
-- priced content (chatter sends an image with $price, examiner clicks the
-- buy button which flips the flag). We need that flag here to render the
-- orange/green pill border and the right "comprar/✓" button on the bubble.

ALTER TABLE public.chatter_messages
  ADD COLUMN IF NOT EXISTS purchased boolean NOT NULL DEFAULT false;

-- The existing row-level policies on chatter_messages allow examiners to
-- update messages in their own sessions, so flipping `purchased` from the
-- examiner UI is already permitted. The chatter side reads `purchased`
-- through the public edge function (read-by-id), no new policy required.
