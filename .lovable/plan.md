

## Audit: Screen Share Button Visibility After Approval

### Problem

After a participant's screen share request is approved, the system correctly claims the token, stores it, and reconnects with elevated permissions. However, `hideScreenShare` is **hardcoded to `true`** on line 164 of `CoworkParticipantView.tsx`:

```tsx
<LiveKitCallView
  ...
  hideScreenShare    // ← always hidden
  getToken={getToken}
/>
```

This means after reconnection with a screen-share-capable token, the participant **still cannot see the screen share button** in CallControls. The elevated permissions are wasted.

### Fix

Track whether the participant has been granted screen share access (i.e., the token was claimed and used for reconnection). Use this state to dynamically set `hideScreenShare`.

### Changes

#### `src/pages/cowork/CoworkParticipantView.tsx`

1. Add a `hasScreenShareAccess` state (boolean, default `false`).
2. Set it to `true` when the screen share token is claimed and reconnection starts.
3. Reset it to `false` when:
   - The participant is moved to a different room (room change detection already exists).
   - The participant manually leaves.
4. Pass `hideScreenShare={!hasScreenShareAccess}` to `LiveKitCallView`.

```tsx
const [hasScreenShareAccess, setHasScreenShareAccess] = useState(false);

// In the approved-request effect, after claiming token:
setHasScreenShareAccess(true);

// In room change detection:
setHasScreenShareAccess(false);

// In onLeave:
setHasScreenShareAccess(false);

// In JSX:
hideScreenShare={!hasScreenShareAccess}
```

Also hide the "Compartir pantalla" request button in the top bar when `hasScreenShareAccess` is true (the participant already has access — no need to request again).

### Files

| File | Change |
|------|--------|
| `src/pages/cowork/CoworkParticipantView.tsx` | Add `hasScreenShareAccess` state, make `hideScreenShare` dynamic, hide request button when access granted |

