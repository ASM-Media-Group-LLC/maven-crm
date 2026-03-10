

## Plan: Fix Dashboard layout gaps for all roles

The problem: when a role (like "employee") has limited permissions, most dashboard sections are hidden via `canAccess()` but the grid containers still render with fixed column counts, leaving awkward empty spaces.

### Issues identified in `src/components/dashboard/DashboardContent.tsx`:

1. **Row 2 (line 362)**: Hard-coded `lg:grid-cols-3`. When LeadGen is hidden, Avisos gets `lg:col-span-2` but inside a 3-col grid — doesn't fill properly.

2. **Row 3 (line 484)**: Pipeline + Top 5 + Pending Tasks grid. Uses `getGridCols` counting booleans, but when only "Tareas Pendientes" shows, it renders in a multi-col grid with empty space.

3. **Row 4 (line 588)**: Tickets + Closers + HR cards. If none are accessible, the empty grid div still renders.

### Changes (single file: `DashboardContent.tsx`):

1. **Row 2**: Dynamically set grid columns based on which cards are visible. If only Avisos shows, use `grid-cols-1` full width. If both show, use `lg:grid-cols-3` as today.

2. **Row 3**: Conditionally render the entire row only if at least one card is visible. Use dynamic column count matching the visible card count (1, 2, or 3).

3. **Row 4**: Wrap in a conditional — only render if at least one of Tickets/Closers/HR is accessible. Use dynamic column count.

4. **Row 2b (Actividad Reciente, line 438)**: Filter items by permission. If all filtered out, the "Sin actividad reciente" fallback shows — this is fine but the card should still look good standalone.

5. **Avisos y Celebraciones card**: When it's the only card in its row, remove the `col-span` hack and let it be full-width naturally via `grid-cols-1`.

All changes are layout/CSS adjustments — no logic or data changes.

