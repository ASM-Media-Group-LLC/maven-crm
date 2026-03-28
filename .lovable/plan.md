

## Plan: Agregar Blue Package al cálculo automático de comisiones

### Cambios en `src/pages/finanzas/comisiones/NuevaComisionModal.tsx`

**1. Ampliar la query de `creator_business`** para incluir `blue_package` y `li_payment_amount` junto con `agency_percentage`.

**2. Actualizar el cálculo:**
```
blueAmount = (blue_package && li_payment_amount > 0) ? li_payment_amount : 0
companyValue = (base * agencyPct / 100) + blueAmount
```

**3. Agregar fila "Blue" en la sección de Cálculo Automático**, entre "Comisión" y "Valor para la Empresa". Solo se muestra si `blue_package === true` y `li_payment_amount > 0`. Muestra el monto fijo (e.g. `$500`).

**4. Incluir el blue amount en el payload de `onSubmit`** dentro de `calculation_config` para trazabilidad.

### Archivos
- **Modificar**: `src/pages/finanzas/comisiones/NuevaComisionModal.tsx`

