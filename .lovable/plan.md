

## Remove "Copiar enlace" from Cowork Video Views

The "Copiar enlace" button in the `CallTopBar` is visible in both the host room and participant room video areas (visible in both screenshots). This button generates a generic video call link that doesn't make sense in the cowork context — participants join via room-specific invite links from the host dashboard instead.

### Changes

**1. `CallTopBar.tsx`** — Add optional `hideShareLink` prop; when true, don't render the copy link button.

**2. `LiveKitCallView.tsx`** — Add optional `hideShareLink` prop, pass it through to `CallTopBar`.

**3. `CoworkHostDashboard.tsx`** — Pass `hideShareLink={true}` to both `LiveKitCallView` instances (room view and Host Hub).

**4. `CoworkParticipantView.tsx`** — Pass `hideShareLink={true}` to the `LiveKitCallView` instance.

This keeps the "Copiar enlace" button working for regular (non-cowork) video calls while hiding it in all cowork contexts. The room-specific invite Link2 buttons on the host sidebar room cards remain unchanged since those serve a different purpose (sharing participant invite links).

