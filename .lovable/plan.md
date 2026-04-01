

## Fix: Agency amount calculation in Invoice creation

### Problem
Currently, `agency` in the invoice totals uses `estimated_amount`, which is `base_amount × percentage + blue_amount` (the full company value including Blue). Then Blue is added again separately from `calculation_config.blue_amount`, resulting in **double-counting** the Blue component.

### Correct logic
- **Agency** = `base_amount × (percentage / 100)` — the commission component only
- **Blue** = `calculation_config.blue_amount` — unchanged
- **PayPal** = `calculation_config.paypal_amount` — unchanged

### Changes

**1. `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`** (~line 92)

Replace agency calculation from:
```ts
const agency = selected.reduce((sum, c) => sum + (c.estimated_amount || 0), 0);
```
To:
```ts
const agency = selected.reduce((sum, c) => {
  const config = c.calculation_config as any;
  const base = Number(c.base_amount) || 0;
  const pct = Number(config?.percentage) || 0;
  return sum + (base * pct / 100);
}, 0);
```

**2. `src/pages/finanzas/facturacion/InvoiceA4Preview.tsx`** — no changes needed, it already renders whatever `agency_amount` is passed. The fix is upstream in the calculation.

