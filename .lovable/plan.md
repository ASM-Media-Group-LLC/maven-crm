

## Security Issue

The current system is **insecure by design**: the `role` parameter is just a URL hint. Anyone can call the `joinSession` edge function directly with `role: "host"` and become a host, regardless of which link they received. The server blindly trusts the client-sent role (line 138 of `cowork-session/index.ts`).

## Secure Solution: Host Invite Code

Add a secret `host_invite_code` to each cowork session. To join as host, the user must provide this code. Participant joins require no code.

### 1. Database: Add `host_invite_code` column

```sql
ALTER TABLE cowork_sessions ADD COLUMN host_invite_code text 
  DEFAULT encode(gen_random_bytes(6), 'hex');
```

This generates a random 12-character hex code per session (e.g., `a3f8b2c1d4e5`).

### 2. Edge Function: Enforce host code on `joinSession`

In `supabase/functions/cowork-session/index.ts`, change the join logic:

- If `role === "host"`, require `hostCode` in the request body
- Validate `hostCode` matches `session.host_invite_code`
- Reject with 403 if code is missing or wrong
- Participant joins remain unchanged (no code needed)

Also add a new action `getHostCode` that only existing hosts can call, to retrieve the code for sharing.

### 3. Client: Lobby enforces role from link type

**`CoworkLobby.tsx`**:
- **No `role` param** (participant link) → Show ONLY "Unirse como participante" button. No host option at all.
- **`role=host`** → Show a host code input field + "Unirse como host" button, plus a secondary "Unirse como participante" option.

### 4. Host Dashboard: Share links include code for hosts

**`CoworkHostDashboard.tsx`**:
- **Host invite button** (Crown): Copies `{origin}/cowork?session={id}&role=host&code={host_invite_code}`
- **Participant invite button** (Users2): Copies `{origin}/cowork?session={id}` (no code)

The host code is fetched via the `getHostCode` action when the dashboard loads.

### 5. Hook update

**`useCoworkSession.ts`**: Add `getHostCode` action and store it for the host dashboard to use when generating share links.

### Files to modify
- **Database migration** — add `host_invite_code` column
- `supabase/functions/cowork-session/index.ts` — enforce code on host join, add `getHostCode` action
- `src/pages/cowork/CoworkLobby.tsx` — role-locked UI + host code input
- `src/pages/cowork/CoworkHostDashboard.tsx` — include code in host share link
- `src/hooks/useCoworkSession.ts` — add `getHostCode` support

### Security model summary

| Link type | Can join as participant | Can join as host |
|-----------|----------------------|-----------------|
| Participant (`?session=X`) | Yes | No (button hidden + server rejects) |
| Host (`?session=X&role=host&code=abc`) | Yes | Only with valid code (server-verified) |
| Direct API call with `role: "host"` | — | Rejected without valid `hostCode` |

