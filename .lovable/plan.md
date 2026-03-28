

## Plan: Ajustar tabla de comisiones en facturación

### Cambios en `src/pages/finanzas/comisiones/ComisionesTab.tsx`

1. **Eliminar columna "Estado"**: Quitar el `<TableHead>` de "Estado" (línea 132), la celda `<TableCell>` con el Badge (línea 159), y ajustar los `colSpan` y skeleton counts de 7 a 6.

2. **Columna "Comisión" — mostrar solo porcentaje**: Cambiar línea 157 para mostrar el porcentaje desde `calculation_config` en vez del monto estimado:
   ```tsx
   // De:
   {fmt(Number(c.estimated_amount) || 0)}
   // A:
   const config = (c.calculation_config || {}) as Record<string, any>;
   {config.percentage ? `${config.percentage}%` : "—"}
   ```

3. **Exportar**: Actualizar el mapeo de exportación (líneas 109-116) para eliminar "Estado" y ajustar "Comisión" al porcentaje.

### Archivo
- **Modificar**: `src/pages/finanzas/comisiones/ComisionesTab.tsx`

