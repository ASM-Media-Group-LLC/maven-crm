

## Fix: Screen Share Approval Not Detected by Participant

### Root Cause

In `useCoworkSession.ts` line 111, the `fetchData` query filters screen share requests by:

```typescript
.in("status", ["pending"])
```

When the host approves a request (status → `"approved"`), realtime triggers a refetch, but the refetch **excludes** approved requests. So `cowork.screenShareRequests` never contains an approved request, and the auto-claim effect in `CoworkParticipantView` (line 46) never fires.

### Fix

**`src/hooks/useCoworkSession.ts`** — Change the status filter on line 111 to include both `"pending"` and `"approved"`:

```typescript
.in("status", ["pending", "approved"])
```

This is the only change needed. The rest of the flow (detect approved → call `claimScreenShareToken` → reconnect with new token) is already correctly implemented in `CoworkParticipantView`.

### Files to modify
- `src/hooks/useCoworkSession.ts` — line 111, add `"approved"` to the status filter

