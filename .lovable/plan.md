

## Reemplazar eliminación por cancelación + columna Estado en Invoices

### Resumen
Eliminar la funcionalidad de borrado de invoices y reemplazarla por "Cancelar" (cambia status a `cancelada`). Agregar columna "Estado" visible en la tabla con badges para todos los estados. Agregar `cancelada` como nuevo estado posible.

### Cambios en `src/pages/finanzas/facturacion/FacturacionPage.tsx`

**1. Actualizar STATUS_BADGE (línea 36-43)**
- Agregar `cancelada: { variant: "destructive", label: "Cancelada" }`

**2. Reemplazar `deleteMutation` (líneas 149-160) por `cancelMutation`**
- En vez de `.delete()`, hacer `.update({ status: "cancelada" })` en la tabla `invoices`
- Renombrar estado `deleteItem` → `cancelItem` y actualizar toda referencia

**3. Tabla: agregar columna "Estado" y reemplazar icono Trash**
- Agregar `<TableHead>Estado</TableHead>` después de "Vencimiento" (línea 252)
- Agregar `<TableCell>` con `<Badge>` del estado correspondiente en cada fila
- Reemplazar `Trash2` por icono `Ban` (de lucide-react) con tooltip "Cancelar"
- El click abre un diálogo de confirmación para cancelar (no eliminar)
- Solo mostrar botón cancelar si `canEdit` (borrador o enviada)

**4. Grid: mismo cambio (líneas 362-369)**
- Reemplazar `Trash2` por `Ban`, mismo comportamiento de cancelación
- Agregar badge de estado en la card

**5. AlertDialog de confirmación (líneas 621-632)**
- Separar la lógica: para invoices usar textos de "Cancelar" en vez de "Eliminar"
- El diálogo de notas de pago mantiene eliminación real (ya que son payment notes)
- Texto: "¿Cancelar invoice #X?" / "El invoice se marcará como cancelado. Esta acción no elimina el registro."
- Botón: "Confirmar Cancelación"

**6. Filtro de estado (línea 314-324)**
- Agregar `<SelectItem value="cancelada">Cancelada</SelectItem>` al dropdown de filtro

**7. Lógica de vencimiento automática (client-side)**
- En el query de invoices o al renderizar, si `status === "enviada"` y `due_date < hoy`, mostrar badge "Vencida" visualmente (sin mutar DB por ahora, solo visual)

### Importaciones
- Reemplazar `Trash2` por `Ban` en el import de lucide-react (mantener `Trash2` solo para notas de pago)

### Archivos a modificar
- `src/pages/finanzas/facturacion/FacturacionPage.tsx`

