

## Plan: Ajustar preview A4 con desglose de Agency Services, Blue y PayPal

### Resumen
Modificar el query de comisiones y el preview A4 en `NuevoInvoicePage.tsx` para mostrar un desglose detallado: Agency Services (ganancia * %), Blue Package (si aplica), y PayPal 5% del restante (si el método de pago es PayPal). Todos los datos provienen de las comisiones y del `creator_business`.

### Cambios en `src/pages/finanzas/facturacion/NuevoInvoicePage.tsx`

**1. Ampliar query de comisiones**
- Agregar `base_amount` al select de comisiones (ya tiene `calculation_config` con percentage, blue_package, blue_amount)

**2. Agregar query de `creator_business`**
- Nuevo `useQuery` para obtener `payment_method` del creador seleccionado:
  ```tsx
  supabase.from("creator_business").select("payment_method").eq("creator_id", creatorId).maybeSingle()
  ```

**3. Calcular los montos desglosados**
- De las comisiones, agregar por separado:
  - `agencyTotal` = suma de `base_amount * (cfg.percentage / 100)` por cada comisión
  - `blueTotal` = suma de `cfg.blue_amount` donde `cfg.blue_package === true`
  - `restante` = suma de `base_amount - (base_amount * cfg.percentage / 100)` por cada comisión
  - `paypalAmount` = si payment_method es "PayPal", entonces `restante * 0.05`, sino 0
  - `grandTotal` = `agencyTotal + blueTotal + paypalAmount`

**4. Actualizar el preview A4 (tabla)**
- Fila 1: "Agency Services" → Amount = `agencyTotal`
- Fila 2 (condicional): "Blue" → Amount = `blueTotal` (solo si blueTotal > 0)
- Fila 3 (condicional): "PayPal" → Amount = `paypalAmount` (solo si payment_method es PayPal)
- Total = `grandTotal`

**5. Actualizar resumen de comisiones y submit**
- El resumen muestra el `grandTotal` en vez de solo `totalAmount`
- El payload de submit usa `grandTotal` como `amount` y `net_amount`

### Archivo
- **Modificar**: `src/pages/finanzas/facturacion/NuevoInvoicePage.tsx`

