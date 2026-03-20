

## Plan: Sticky Header/Actions + Fix Stage Colors + Remove "Pendiente LG" from Closers Table

### Issues

1. **Header and Actions column not sticky**: LeadGen table has `sticky top-0 z-10 bg-card` on `TableHeader` and `sticky right-0 bg-card` on the Actions column. The Closers `LeadTable.tsx` has sticky header (`sticky top-0 z-10 bg-background`) but does NOT have a sticky right Actions column.

2. **"Pendiente LG" stage confusion**: This stage exists as a tab but also appears in the stage badge colors and inline stage selector. It's an intermediate state from the LeadGen sync — users shouldn't see it as a selectable stage within the table. The tab is fine for filtering, but the stage badge and inline selector should not expose it as a manual option.

3. **"Confirmada" and "Completada" same green semantic**: Both use green shades (`green-100/green-800` vs `green-200/green-900`), which are nearly indistinguishable. Fix: change "Completada" to a distinct blue/purple to signal "done/closed" vs "confirmed/active".

### Changes

**1. `src/pages/closers/components/LeadTable.tsx`**

- **Sticky Actions column**: Add `sticky right-0 bg-background z-20` to all Actions `<TableHead>` headers and corresponding `<TableCell>` elements across all tab layouts (asignadas, confirmadas, todas, pendiente_lg). Match the LeadGen pattern exactly.
- **Table wrapper**: Add `max-h-[calc(100vh-24rem)]` to the outer div (matching LeadGen) so the table scrolls vertically with sticky header visible.
- **Min-width**: Add `min-w-[1000px]` to `<Table>` to guarantee horizontal scroll.

**2. `src/pages/closers/components/LeadTable.tsx` — Fix stage colors**

Update `stageColor()`:
- "Confirmada" → keep green: `bg-green-100 text-green-800` (active, confirmed)
- "Completada" → change to blue: `bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400` (done, closed — visually distinct)
- "Pendiente LG" → keep yellow (only shown in pendiente_lg tab, not user-selectable)

**3. `src/pages/closers/components/LeadTable.tsx` — Hide "Pendiente LG" from inline stage selector**

In `InlineStageSelect`, filter out "Pendiente LG" from the selectable stages list so users can't manually set it.

**4. Same color fix in `CreatorTable.tsx`** (the older table component)

Update `stageBadgeColor()` to match: "Completada" → blue instead of green.

### Files Modified
- `src/pages/closers/components/LeadTable.tsx` — sticky actions, stage colors, min-width, max-height
- `src/pages/closers/components/CreatorTable.tsx` — stage color consistency

