

## Plan: Simplificar modal de comisiones con porcentaje automático del creador

### Cambios en `NuevaComisionModal.tsx`

**1. Campos del formulario (solo estos):**
- Creador (combobox)
- Fecha Inicio / Fecha Fin
- Ganancia Total (USD)
- Observaciones

**2. Eliminar campos:**
- Nombre del Periodo
- Tipo de Comisión / Porcentaje / Valor Fijo (inputs manuales)
- Estado de Pago, Fecha de Pago, Método de Pago

**3. Obtener porcentaje automáticamente:**
- Al seleccionar creador, query a `creator_business` para obtener `agency_percentage`
- Mostrar en el cálculo automático como solo lectura (sin input editable)

**4. Cálculo automático (nueva lógica):**
```
Ganancia de la Creadora:    $X    (= ganancia total ingresada)
Comisión (Y%):              Y%    (= agency_percentage del creador, solo se muestra el %)
Valor para la Empresa:      $W    (= ganancia total × agency_percentage / 100)
```

- "Comisión" solo muestra el porcentaje asignado al creador, no calcula un valor monetario propio
- "Valor para la Empresa" = `base * (agency_percentage / 100)`
- Si el creador no tiene porcentaje configurado, mostrar mensaje indicándolo

**5. Submit simplificado:**
- `commission_type` = `"percentage"`, `percentage` = `agency_percentage`, `status` = `"pendiente"`
- `estimated_amount` = valor para la empresa
- Se eliminan campos de pago del payload

### Archivo a modificar
- `src/pages/finanzas/comisiones/NuevaComisionModal.tsx`

