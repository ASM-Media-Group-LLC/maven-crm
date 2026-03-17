

## Problem

The cowork module's realtime subscriptions (`postgres_changes`) are configured in `useCoworkSession.ts` but **no events are ever delivered** because the cowork tables were never added to the `supabase_realtime` publication. This means all changes (participant joins, room assignments, host requests, screen share requests) require a manual page refresh to appear.

## Root Cause

Supabase Realtime requires tables to be explicitly added to the `supabase_realtime` publication. Currently, zero cowork tables are in this publication:

```text
cowork_sessions          — NOT in publication
cowork_rooms             — NOT in publication  
cowork_memberships       — NOT in publication
cowork_room_assignments  — NOT in publication
cowork_host_requests     — NOT in publication
cowork_screenshare_requests — NOT in publication
```

The REPLICA IDENTITY FULL is already set on all tables except `cowork_sessions` (which uses DEFAULT). That's fine for sessions since hosts only need SELECT, but sessions should also be in the publication for status changes (e.g., ending a session).

## Fix

### 1. Database Migration — Add all cowork tables to `supabase_realtime` publication

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.cowork_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cowork_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cowork_memberships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cowork_room_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cowork_host_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cowork_screenshare_requests;
```

Also set REPLICA IDENTITY FULL on `cowork_sessions` (currently DEFAULT) so UPDATE/DELETE events propagate correctly through RLS:

```sql
ALTER TABLE public.cowork_sessions REPLICA IDENTITY FULL;
```

### 2. Minor improvement to `useCoworkSession.ts` — Add rooms subscription

The hook subscribes to assignments, memberships, host requests, and screen share requests but does **not** subscribe to room changes (e.g., if a host adds a room mid-session). Add a 5th channel for `cowork_rooms`.

Also, avoid setting `loading: true` on refetches triggered by realtime (only on initial load) to prevent UI flicker.

### Files to modify
- **Database migration** — add 6 tables to `supabase_realtime`, set REPLICA IDENTITY FULL on `cowork_sessions`
- `src/hooks/useCoworkSession.ts` — add rooms channel subscription, avoid loading flicker on realtime refetches

