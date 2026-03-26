

## Plan: Fix hover transparency in invoice table

### Problem
The `TableRow` component uses `hover:bg-muted/50` (semi-transparent) which causes see-through effects. The sticky actions column uses `group-hover:bg-muted/30` which is also semi-transparent, letting the "Vencimiento" column bleed through.

### Changes

**1. `src/components/ui/table.tsx` (line 41)**
- Change `hover:bg-muted/50` → `hover:bg-muted` (fully opaque hover background).

**2. `src/pages/finanzas/facturacion/FacturacionPage.tsx` (line 208)**
- Change `sticky right-0 bg-card group-hover:bg-muted/30` → `sticky right-0 bg-card group-hover:bg-muted` on the actions `TableCell` so it matches the row hover exactly and stays fully opaque.

**3. `src/pages/finanzas/facturacion/FacturacionPage.tsx` (line 176)**
- Ensure the sticky header actions cell also has a solid `bg-card` with proper z-index (already correct).

Two files, two single-line edits each.

