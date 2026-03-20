

## Plan: Fix Toggle Position, Sticky Headers, and Add Contactos Pagination

### 1. Toggle position in Closers — keep inline, not wrapping

**`src/pages/closers/ClosersContent.tsx`** (lines 106-194): The filter bar uses `flex-wrap` which causes the `ml-auto` toggle to wrap below on smaller screens. Remove `ml-auto` from the toggle group and place it immediately after the `DateRangePicker` + "Limpiar" button, without `ml-auto`, so it stays in the same visual row next to the date selector. Use a simple `flex gap-1` wrapper without auto margin.

### 2. Sticky table header in Closers

**`src/pages/closers/components/LeadTable.tsx`**: The table already has `sticky top-0` on `TableHeader`, but the outer scroll container in `ClosersContent.tsx` (line 197: `<div className="flex-1 overflow-auto px-6 py-4">`) controls the scroll. The table's own `max-h` and `overflow-auto` wrapper needs to be present inside `LeadTable.tsx` so the sticky header works within its own scroll context (like ContactosTable does with `max-h-[calc(100vh-24rem)] overflow-auto`). Verify and add the constrained wrapper if missing.

### 3. Sticky table header in Contactos

**`src/pages/contactos/ContactosTable.tsx`** (line 87-89): Already has `max-h-[calc(100vh-24rem)] overflow-auto` and `sticky top-0 z-10 bg-card` — this should work. Verify it's not broken by the outer `overflow-auto` on the parent div.

### 4. Add server-side pagination to Contactos

**`src/pages/contactos/ContactosContent.tsx`**:
- Add `page` state and `pageSize = 50`
- Change the query to use `.range()` with `{ count: "exact" }` instead of fetching all contacts
- Pass `page` and `pageSize` to the query, return `{ data, total }`
- Add `EarningsPagination` component below the table/grid
- Reset page to 0 when filters change
- Move date/search filtering to server-side where possible (`.ilike()` for search, `.gte()`/`.lte()` for dates)

### Files Modified
- `src/pages/closers/ClosersContent.tsx` — move toggle inline next to date picker
- `src/pages/closers/components/LeadTable.tsx` — ensure table has own scroll container with sticky header
- `src/pages/contactos/ContactosContent.tsx` — add server-side pagination with `.range()`, add EarningsPagination
- `src/pages/contactos/ContactosTable.tsx` — verify sticky header (already present)

