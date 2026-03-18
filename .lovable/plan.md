

## Change Room Card Participants from List to Grid

### What changes
In the Host Dashboard room cards, participants are currently shown as a vertical list. This will be changed to a compact grid layout using avatars with online indicators and names, making better use of card space.

### Scope
Only one location needs changes: **`src/pages/cowork/CoworkHostDashboard.tsx`** (lines 392-435) — the participant listing inside each room card.

The sidebar's "Sin asignar" section (lines 222-246) will remain as a list since it includes assignment dropdowns that don't work well in a grid.

### Implementation

Replace the `space-y-1.5` vertical list (lines 393-435) with a grid layout:

- Use `grid grid-cols-2 gap-2` to display participants in a 2-column grid
- Each grid cell shows: online indicator dot, truncated name, and a move action button (dropdown + arrow)
- The move controls will be accessed via a small icon button that opens the Select dropdown, keeping the grid compact
- Avatar-style initials circle for each participant instead of just a dot + name

### Technical detail
```
Before (list):
  ● Juan Pérez       [Mover a... ▼] →
  ● María López      [Mover a... ▼] →

After (grid):
  ┌──────────┐ ┌──────────┐
  │ ●JP      │ │ ●ML      │
  │ Juan P.  │ │ María L. │
  │ [Mover▼] │ │ [Mover▼] │
  └──────────┘ └──────────┘
```

Each cell: avatar with initials + online dot overlay, truncated name below, compact move dropdown.

### File modified
- `src/pages/cowork/CoworkHostDashboard.tsx` — Replace participant list with grid layout in room cards

