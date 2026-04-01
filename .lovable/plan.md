

## Cambios en la tabla de Comisiones

### Archivo: `src/pages/finanzas/comisiones/ComisionesTab.tsx`

**1. Quitar color rojo de la columna Comisión (línea 160)**
- Cambiar `text-destructive` → `text-foreground` (blanco en tema oscuro)

**2. Edición inline en la columna Blue (línea 161)**
- Agregar estados `editingBlueId` y `editBlueValue` para controlar qué fila se edita
- En la celda Blue: al hacer click se muestra un `<Input>` numérico; al presionar Enter o perder foco se guarda
- Crear `updateBlueMutation` que actualice `calculation_config.blue_amount` y recalcule `final_amount` en Supabase
- Recálculo: `final_amount = base_amount * (percentage / 100) + nuevo_blue_amount`

### Flujo de edición
- Click en valor Blue → aparece input con el monto actual
- Enter o blur → guarda via mutation → invalida query → tabla se actualiza
- Escape → cancela edición

