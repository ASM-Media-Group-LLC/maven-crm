

## Problem

Currently the Host Dashboard has a single "Copy link" button that always copies a host link (`?role=host`). There's no way to share a participant-only link. Also, the user wants all "copy link" buttons hidden from room cards (though room cards don't currently have them — the host hub area and header do).

## Plan

### 1. Replace single Copy button with two share buttons (`CoworkHostDashboard.tsx`)

In the header area (lines 78-89), replace the single `<Copy>` button with two distinct buttons:
- **Host invite button** (Crown icon): copies `{origin}/cowork?session={id}&role=host`
- **Participant invite button** (Users2 icon): copies `{origin}/cowork?session={id}` (no role param → lobby defaults to participant)

Both will show a toast indicating which type of link was copied (e.g., "Enlace de host copiado" vs "Enlace de participante copiado").

### 2. Clean up CoworkLobby behavior (`CoworkLobby.tsx`)

Already handles `role=host` from URL. When no `role` param is present (participant link), the lobby correctly shows "Join as participant" as the primary button. No changes needed.

### 3. Verify no copy/link buttons exist in room cards

The room cards in the sidebar (lines 117-188) have no copy buttons — only "Entrar/Salir". The Host Hub section (lines 318-334) also has no copy button. No removal needed.

### Files to modify
- `src/pages/cowork/CoworkHostDashboard.tsx` — replace single Copy button with two separate share buttons

