

## Plan: Fix Participant Direct Room Join Flow

### Problem

When a participant clicks a room invite link (`?session=X&room=Y`), they get stuck on "Esperando asignación de sala por el host..." because the room assignment is never created.

**Root cause** — two bugs working together:

1. **Client** (`CoworkPage.tsx` line 40-43): If the user already has a participant membership, the auto-join check sees `!wantsHost && !isHost` → true → **skips the join call entirely**. The room assignment is never requested even though the URL has `?room=Y`.

2. **Server** (`cowork-session/index.ts` line 148-149): Even if the client did call `joinSession` again, the server returns early with `alreadyJoined: true` for same-role members **without checking or creating the room assignment**.

Both paths fail: the participant gets a membership but no room assignment.

### Changes

#### 1. Server: `supabase/functions/cowork-session/index.ts` (lines 146-150)

When an existing participant re-joins with the same role AND a `roomId` is provided, check if they have an active room assignment. If not, create one for the requested room.

```
if (existing.role === memberRole) {
  // Same role — but if participant + roomId, ensure room assignment exists
  if (memberRole === "participant" && roomId) {
    const { data: currentAssignment } = await admin.from("cowork_room_assignments")
      .select("id").eq("session_id", sessionId).eq("user_id", userId).eq("is_active", true).single();
    if (!currentAssignment) {
      // Create assignment for the room from the URL
      const { data: roomCheck } = await admin.from("cowork_rooms")
        .select("id").eq("id", roomId).eq("session_id", sessionId).single();
      if (roomCheck) {
        await admin.from("cowork_room_assignments").insert({
          session_id: sessionId, user_id: userId, room_id: roomId, assigned_by: userId,
        });
      }
    }
  }
  return json({ membership: existing, alreadyJoined: true });
}
```

#### 2. Client: `src/pages/cowork/CoworkPage.tsx` (lines 39-44)

Change the skip condition: even if the user already has a participant membership, if there's a `roomId` in the URL and `myAssignment` is null, still trigger the join call to create the assignment.

```
if (cowork.myMembership) {
  const wantsHost = role === "host" && code;
  const isHost = cowork.myMembership.role === "host";
  const needsRoomAssignment = !wantsHost && !isHost && roomId && !cowork.myAssignment;
  if (((wantsHost && isHost) || (!wantsHost && !isHost)) && !needsRoomAssignment) return;
}
```

### Files

| File | Change |
|------|--------|
| `supabase/functions/cowork-session/index.ts` | Create room assignment for same-role re-joins with roomId |
| `src/pages/cowork/CoworkPage.tsx` | Don't skip auto-join when participant has no assignment but URL has roomId |

