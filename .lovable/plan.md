

## Plan: Auto-Join from Invite URLs (Skip Lobby)

### Problem
When a user clicks a host invite link (`?session=X&role=host&code=Y`) or a participant room link (`?session=X&room=Z`), they see a lobby card requiring manual button clicks. Since the URL already contains all needed info, the system should auto-join directly.

### Changes

#### 1. Auto-join in `CoworkPage.tsx`
Add an effect that detects when `!cowork.myMembership` and the URL contains sufficient join info, then auto-joins without showing the lobby:

- **Host link** (`role=host` + `code=X`): Auto-call `cowork.joinSession(sessionId, "host", code)` → skip lobby entirely
- **Participant link** (`room=X`): Auto-call `cowork.joinSession(sessionId, "participant", undefined, roomId)` → skip lobby
- Track an `autoJoining` state to show a spinner during the process
- On error, fall back to showing the `CoworkLobby` so the user can retry manually

#### 2. Simplify `CoworkLobby.tsx`
The lobby becomes a fallback-only view (no URL params to auto-join). Remove the URL param reading logic (`role`, `code`) from the lobby since it's now handled upstream. Keep it as a simple "Join as participant" screen for direct `/cowork?session=X` links without role/room params.

### Files

| Action | File |
|--------|------|
| Modify | `src/pages/cowork/CoworkPage.tsx` — add auto-join effect |
| Modify | `src/pages/cowork/CoworkLobby.tsx` — simplify to fallback only |

