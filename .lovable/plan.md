

## Snapshot inmutable de comisiones en invoices

### Estado actual encontrado

**`creator_business`** ya tiene en BD:
- `commission_type` (text, default `'fixed'`) — `"fixed"` o `"tiered"`
- `commission_tiers` (jsonb, default `'[]'`) — array de `{min_revenue, max_revenue, percentage}`
- `agency_percentage` (numeric) — porcentaje fijo

**Datos reales**: 1 creadora con `tiered` y tramos `[{0-999: 10%}, {1000+: 20%}]`. El resto usa `fixed`.

**`commissions`** ya guarda un snapshot parcial en `calculation_config` (jsonb):
```json
{ "percentage": 30, "blue_package": true, "blue_amount": 150 }
```
Pero NO guarda: el tramo que aplicó, las ganancias del periodo, ni el tipo de cálculo usado.

**`invoices`** no tiene ningún campo de snapshot de comisión. Los montos (`agency_amount`, `amount`) se guardan pero sin contexto de cómo se calcularon.

**Lógica de tramos** (frontend, `NuevaComisionModal.tsx` líneas 67-78):
```typescript
if (commType === "tiered" && Array.isArray(commTiers)) {
  const matchedTier = commTiers.find(
    t => base >= t.min_revenue && (t.max_revenue === null || base <= t.max_revenue)
  );
  agencyPct = matchedTier?.percentage ?? 0;
}
```

**Flujo invoice**: `CrearInvoiceModal` lee comisiones ya creadas y recalcula `agency_amount` desde `calculation_config.percentage × base_amount`. No consulta `creator_business` directamente.

### Problema confirmado
- Los tramos YA están en BD (`creator_business.commission_tiers`) — no están hardcodeados
- Pero la comisión creada solo guarda `percentage` en `calculation_config`, sin tramo ni ganancias
- El invoice no tiene snapshot propio; si se edita la comisión, el invoice cambia

### Migración SQL propuesta (REVISAR ANTES DE APLICAR)

```sql
-- 1. Enriquecer snapshot en invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS commission_snapshot jsonb DEFAULT NULL;

-- Estructura del jsonb commission_snapshot:
-- {
--   "commission_type": "tiered" | "fixed",
--   "commission_percentage": 25,
--   "commission_amount": 500,
--   "earnings_period": 2000,
--   "tier_from": 1000,
--   "tier_to": null,
--   "tiers_config": [{min_revenue, max_revenue, percentage}, ...],
--   "blue_amount": 150,
--   "paypal_amount": 0
-- }

-- No se tocan columnas existentes
-- No se modifican registros existentes (DEFAULT NULL)
-- No se tocan triggers existentes
```

Se usa un solo campo jsonb en lugar de 5 columnas individuales porque:
- Es un snapshot de lectura (no se filtra ni ordena por estos campos)
- Permite almacenar la configuración completa de tramos sin normalización adicional
- Los invoices existentes quedan con `NULL` (backward compatible)

### Cambios en frontend

**1. `NuevaComisionModal.tsx`**
- Al crear comisión, enriquecer `calculation_config` con el tramo aplicado:
```json
{
  "percentage": 25,
  "commission_type": "tiered",
  "tier_from": 1000,
  "tier_to": null,
  "tiers_config": [...],
  "blue_package": true,
  "blue_amount": 150
}
```

**2. `CrearInvoiceModal.tsx`**
- Al crear invoice, construir `commission_snapshot` a partir de las comisiones seleccionadas
- Guardar el snapshot en el insert a `invoices`

**3. Visualización de invoice existente**
- Si `commission_snapshot` existe → mostrar valores congelados
- Si `commission_snapshot` es NULL (invoices antiguos) → mantener comportamiento actual (recalcular desde comisiones)

### Archivos a modificar
- 1 migración SQL (1 columna jsonb en `invoices`)
- `src/pages/finanzas/comisiones/NuevaComisionModal.tsx` — enriquecer `calculation_config`
- `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx` — guardar `commission_snapshot`
- Componente de vista de invoice (si existe) — leer snapshot cuando disponible

### Sin riesgo
- No se modifica data existente
- No se eliminan columnas
- Default `NULL` para backward compatibility
- No se tocan triggers

