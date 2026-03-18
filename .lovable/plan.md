

## Plan: Mutually Exclusive Host/Participant Links

### Problem
The server-side `joinSession` action (line 134-136 in `cowork-session/index.ts`) returns early with `alreadyJoined: true` if the user already has a membership, **without updating the role**. This means:
- If you first join as participant, then click a host invite link → you stay as participant
- The cached membership prevents role switching entirely

### Root Cause
```typescript
// Current behavior (line 134-136):
const { data: existing } = await admin.from("cowork_memberships")...
if (existing) return json({ membership: existing, alreadyJoined: true });
// ^ Never updates role, just returns old membership
```

### Changes

#### 1. Edge Function: `supabase/functions/cowork-session/index.ts`
When a user already has a membership but is joining with a **different role**, update their membership instead of returning early:

- If `existing.role !== requestedRole` and the role change is valid (host code verified for host role):
  - Update the membership role in `cowork_memberships`
  - If switching **to participant** with a `roomId`, create room assignment
  - If switching **to host**, remove any active room assignment (hosts use the Hub)
  - Return updated membership with `roleChanged: true`
- If same role, keep current early-return behavior

#### 2. Client: `src/pages/cowork/CoworkPage.tsx`
After auto-join returns, if `roleChanged` or `alreadyJoined` with a different role than expected, force a `refetch()` to reload membership data and render the correct view (host dashboard vs participant view).

### Files

| Action | File |
|--------|------|
| Modify | `supabase/functions/cowork-session/index.ts` — update role on re-join with different credentials |
| Modify | `src/pages/cowork/CoworkPage.tsx` — handle role change response from join |

