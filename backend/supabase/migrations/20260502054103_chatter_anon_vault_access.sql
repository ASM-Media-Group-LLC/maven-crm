-- ============================================================================
-- Chatter anon access to vault items
-- ============================================================================
-- The chatter (no Maven account) needs to browse the vault of the profile
-- they're impersonating, so they can send the model's actual content as
-- replies — the whole point of the role-play is using the prepared assets,
-- not improvising new ones.
--
-- Same scoping rule as chatter_profiles_anon_read: only items whose parent
-- profile is referenced by a non-ended session.

GRANT SELECT ON public.chatter_vault_items TO anon;

DROP POLICY IF EXISTS chatter_vault_anon_read ON public.chatter_vault_items;

CREATE POLICY chatter_vault_anon_read ON public.chatter_vault_items
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.chatter_sessions s
      WHERE s.profile_id = chatter_vault_items.profile_id
        AND s.status <> 'ended'
    )
  );
