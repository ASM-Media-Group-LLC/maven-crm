-- ============================================================================
-- Tenants + tenant membership — base for multi-tenant isolation
-- ============================================================================
-- Maven CRM is going to be sold to external agencies (Phase 2). Each
-- agency = one tenant. Today there's a single tenant: ASM Tech.
--
-- This migration is the FIRST piece of the multi-tenant work; the
-- two follow-up migrations (qa_tenant_isolation, scouter_tenant_isolation)
-- add tenant_id columns + tenant-scoped RLS to the qa_* and scouter_*
-- tables. Maven's older tables (creators, sales, …) are out of scope
-- for this slice and stay single-tenant for now (deuda known).

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
CREATE TABLE public.tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,                 -- 'asm-tech', 'agency-x', ...
  name        text NOT NULL,                        -- display name
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tenant_members (
  user_id     uuid NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,
  -- 'owner' | 'admin' | 'member' — kept as free text so we can extend
  -- without a schema change (e.g. 'support', 'auditor').
  role        text NOT NULL DEFAULT 'member',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX tenant_members_user_idx   ON public.tenant_members(user_id);
CREATE INDEX tenant_members_tenant_idx ON public.tenant_members(tenant_id);

-- ----------------------------------------------------------------------------
-- 2. Helper: current_tenant_id()
-- ----------------------------------------------------------------------------
-- Returns the tenant_id of the user calling the query. Used by the
-- tenant-scoped RLS policies on every qa_* / scouter_* table, and as
-- the DEFAULT value for tenant_id columns so app-level inserts don't
-- need to know about it.
--
-- SECURITY DEFINER + STABLE so RLS policies can call it without
-- triggering recursion through tenant_members' own RLS.
--
-- For users in multiple tenants, returns the earliest membership.
-- A future "active tenant switcher" will need a session-scoped
-- override (e.g. via JWT claim or a settings table).
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.tenant_members
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1
$$;

-- ----------------------------------------------------------------------------
-- 3. RLS — users only see their own tenants / memberships
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_self_visible" ON public.tenants
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

-- Membership is per-user. Users see only their own rows.
CREATE POLICY "tenant_members_own" ON public.tenant_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Writes to these two tables are reserved for service role / admin
-- workflows. Authenticated users can't insert themselves into a new
-- tenant or rename one — that flow goes through the admin tooling.
-- (No INSERT/UPDATE/DELETE policies on purpose.)

-- ----------------------------------------------------------------------------
-- 4. Seed — first tenant (ASM Tech) + assign every existing user
-- ----------------------------------------------------------------------------
INSERT INTO public.tenants (slug, name)
VALUES ('asm-tech', 'ASM Tech')
ON CONFLICT (slug) DO NOTHING;

-- Every existing auth.users row becomes a 'member' of ASM Tech. Future
-- signups are NOT auto-attached — they'll come through an explicit
-- onboarding flow (invite link, admin assignment, etc.).
--
-- IMPORTANT: 'member' is the safe default. 'owner' / 'admin' promotion
-- is done manually via SQL (or via the eventual tenant admin UI). When
-- role-gated logic ships (invite users, manage tenant settings,
-- billing, etc.) blindly seeding everyone as 'owner' would expose
-- privileged actions to the whole team.
--
-- Manual promotion example for the workspace lead:
--   UPDATE public.tenant_members SET role = 'owner'
--   WHERE user_id = (SELECT id FROM auth.users WHERE email = '<your-email>');
INSERT INTO public.tenant_members (user_id, tenant_id, role)
SELECT u.id, t.id, 'member'
FROM auth.users u
CROSS JOIN public.tenants t
WHERE t.slug = 'asm-tech'
ON CONFLICT (user_id, tenant_id) DO NOTHING;
