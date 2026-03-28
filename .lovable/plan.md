

## Plan: Agregar columna "Blue" y renombrar "Empresa" a "Comisión total"

### Cambios en `src/pages/finanzas/comisiones/ComisionesTab.tsx`

**1. Header — agregar columna "Blue" y renombrar "Empresa"**
- Insertar `<TableHead>Blue</TableHead>` entre "Comisión" y "Empresa" (línea 133)
- Renombrar "Empresa" a "Comisión total"

**2. Body — agregar celda Blue**
- Extraer `calculation_config` y mostrar `blue_amount` formateado si `blue_package` está activo, sino "—"
- Insertar la celda entre Comisión y Comisión total
- Ajustar skeleton count y colSpan de 6 a 7

**3. Export — actualizar mapeo**
- Agregar campo "Blue" al export con el monto del blue package
- Renombrar "Empresa" a "Comision total"

### Archivo
- **Modificar**: `src/pages/finanzas/comisiones/ComisionesTab.tsx`

