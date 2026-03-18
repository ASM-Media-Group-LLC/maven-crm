

## Audit: Limit Cowork Sessions and Rooms to 10

### Current State

- **CoworkCreateDialog**: No limit on rooms — users can click "Agregar sala" indefinitely.
- **Edge function `createSession`**: No validation on `roomNames.length` — accepts any number of rooms.
- **No session limit**: No check on how many active sessions a user has created.

### Plan

#### 1. `src/pages/cowork/CoworkCreateDialog.tsx` — Client-side room limit
- Cap `addRoom` to only work when `roomNames.length < 10`.
- Disable the "Agregar sala" button when 10 rooms reached.
- Show a helper text like "Máximo 10 salas" near the rooms label.

#### 2. `supabase/functions/cowork-session/index.ts` — Server-side validation
- **Room limit**: In `createSession`, reject if `roomNames.length > 10`.
- **Session limit**: Before creating, count active sessions where `created_by = userId` and `status = 'active'`. Reject if count >= 10.

### Files

| File | Change |
|------|--------|
| `src/pages/cowork/CoworkCreateDialog.tsx` | Disable "Agregar sala" at 10 rooms, show limit hint |
| `supabase/functions/cowork-session/index.ts` | Validate room count ≤ 10 and active sessions ≤ 10 per user |

