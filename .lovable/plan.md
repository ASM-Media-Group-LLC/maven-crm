

## Edición inline en columna Comisión (porcentaje)

### Cambios en `src/pages/finanzas/comisiones/ComisionesTab.tsx`

**1. Agregar estados para edición de comisión**
- Añadir `editingCommId` y `editCommValue` (similar a los existentes para Blue)

**2. Crear mutation `updateCommissionMutation`**
- Actualiza `calculation_config.percentage` y recalcula `final_amount = base_amount * (newPercentage / 100) + blue_amount`

**3. Hacer clickeable la celda de Comisión (línea 182)**
- Reemplazar el texto estático por lógica condicional:
  - Si `editingCommId === c.id` → mostrar `<Input>` numérico (igual que Blue)
  - Si no → mostrar `<span>` clickeable con `cursor-pointer hover:underline`
- Guardar con Enter o blur, cancelar con Escape

### Archivo a modificar
- `src/pages/finanzas/comisiones/ComisionesTab.tsx`

