

## Two Problems Identified

### Problem 1: Layout still cut off
The previous fix added `grid-rows-[1fr]` and `overflow-hidden` to the grid, but the issue persists because the `minHeight` / `minWidth` style on the inner wrapper (line 180) still forces the scrollable area to expand. The grid constraint helps, but the real fix needs the entire right column chain to be strictly bounded.

**Fix**: Ensure the content area between header and footer has an explicit computed height rather than relying on `flex-1` alone. Add `overflow-hidden` to the content wrapper (line 98) and ensure every container in the chain uses `min-h-0 overflow-hidden` except the final scroll container which uses `overflow-auto`.

### Problem 2: No real-time updates for invoices
The app uses React Query's `invalidateQueries` after mutations, which works for the current user's actions. But there's no Supabase Realtime subscription on the `invoices` table, so changes from other sources or even race conditions won't reflect without manual refresh.

**Fix**:
1. Run a migration to add `invoices` to the Supabase realtime publication
2. Add a realtime subscription in `FacturacionPage.tsx` that invalidates the `["invoices"]` query key on any change

---

## Changes

### 1. SQL Migration
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
```

### 2. `src/pages/finanzas/facturacion/FacturacionPage.tsx`
Add a `useEffect` with a Supabase channel subscription for `postgres_changes` on `invoices`, invalidating `["invoices"]` on any event. Clean up channel on unmount. Pattern matches existing hooks like `useChat.ts`.

### 3. `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`
Tighten the layout chain so the right column never grows past its container:
- Line 98: add `overflow-hidden` to the content wrapper
- Line 180: keep `minHeight`/`minWidth` for scroll content but ensure the parent chain is fully bounded with `min-h-0 overflow-hidden`

This is a minimal, targeted fix following the same realtime patterns already used throughout the project (chat, cowork, notifications).

