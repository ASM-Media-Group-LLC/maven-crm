

## Plan: Reestructurar creación de Invoice con búsqueda automática de comisiones

### Resumen
Simplificar el formulario de creación de invoice a solo 4 campos (creador, rango de fechas, fecha vencimiento, notas). Al seleccionar creador + rango de fechas, el sistema busca automáticamente las comisiones asociadas en la tabla `commissions` y calcula el total de `final_amount` (Valor para la Empresa), que se refleja como "Agency Service" en el preview A4.

### Cambios en `src/pages/finanzas/facturacion/NuevoInvoicePage.tsx`

**1. Formulario — eliminar campos, agregar rango de fechas**
- **Eliminar**: campo "Monto", "Tipo de Fee", "Método de Pago", "Fee Manual"
- **Agregar**: dos inputs de tipo `date` para "Fecha inicio" y "Fecha fin" del periodo

**2. Query automática de comisiones**
- Nuevo `useQuery` que se activa cuando `creatorId`, `dateFrom` y `dateTo` están definidos
- Consulta: `supabase.from("commissions").select("*").eq("creator_id", creatorId).gte("period_start", dateFrom).lte("period_end", dateTo)`
- Del resultado, sumar todos los `final_amount` para obtener el total del invoice
- Mostrar debajo de los inputs un resumen: "X comisiones encontradas — Total: $Y"

**3. Preview A4 — actualizar Amount**
- "Agency Service" Amount = suma de `final_amount` de las comisiones encontradas
- Eliminar filas de Fee del preview (ya no aplican)
- "Total Neto" = mismo valor (sin deducciones de fee)

**4. Submit — ajustar payload**
- `amount` = total calculado de comisiones
- Eliminar `fee_type`, `fee_amount`, `net_amount`, `payment_method` del payload
- `net_amount` = mismo que amount
- Validación: deshabilitado si no hay comisiones encontradas

**5. Botón Crear — condición**
- Disabled si `!creatorId || !dateFrom || !dateTo || totalAmount === 0`

### Archivo
- **Modificar**: `src/pages/finanzas/facturacion/NuevoInvoicePage.tsx`

