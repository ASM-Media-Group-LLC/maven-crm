

## Audit: Private Call Flow and Hang Up Button — Fixes

### Issues Found

1. **Host dashboard still uses old "1:1" terminology** — Lines 284, 297 use `"1:1 con ..."`, line 300 says `"Unirse 1:1"`, line 108 says `"Sesión 1:1 finalizada"`. These were missed in the previous rename pass.

2. **LiveKitCallView `handleLeave` always shows "Llamada finalizada" toast** (line 91) — This fires on every hang up, including cowork breakout rooms and private calls. In cowork context, the participant already gets a specific toast ("Llamada privada con host finalizada" or just disconnects from room). The generic "Llamada finalizada" toast stacks on top, creating duplicate/confusing notifications.

3. **Private call flow is correct** — Full-screen takeover works, main room disconnects, auto-reconnect on end, and the host's auto-close watcher mirrors the participant's. No structural issues.

### Fixes

**`src/pages/cowork/CoworkHostDashboard.tsx`** — Update remaining "1:1" strings:
- Line 108: `"Sesión 1:1 finalizada"` → `"Llamada privada finalizada"`
- Line 284: `"1:1 con ${name}"` → `"Llamada privada con ${name}"`
- Line 297: `"1:1 con ${name}"` → `"Llamada privada con ${name}"`
- Line 300: `"Unirse 1:1"` → `"Unirse a llamada privada"`

**`src/pages/cowork/CoworkParticipantView.tsx`** — Suppress the generic "Llamada finalizada" toast for cowork rooms by passing a custom `onLeave` that does NOT trigger the default toast. This requires no LiveKitCallView changes — the `onLeave` callback already runs custom logic; the issue is that `handleLeave` in LiveKitCallView *also* toasts. To fix cleanly:

- Add an optional `suppressLeaveToast` prop to `LiveKitCallView`
- When true, skip the `toast.info("Llamada finalizada")` in `handleLeave`
- Pass `suppressLeaveToast` from both cowork components (participant and host dashboard)

**`src/pages/messenger/videocall/LiveKitCallView.tsx`** — Add `suppressLeaveToast?: boolean` prop; conditionally skip the toast in `handleLeave` (line 91).

### Files modified
- `src/pages/cowork/CoworkHostDashboard.tsx` — 4 string replacements
- `src/pages/cowork/CoworkParticipantView.tsx` — Add `suppressLeaveToast` to both LiveKitCallView usages
- `src/pages/messenger/videocall/LiveKitCallView.tsx` — Add prop and conditional toast skip

