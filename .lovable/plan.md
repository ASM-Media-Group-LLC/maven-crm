

## Plan: Asegurar que el campo "Dirección de Facturación" sea visible en Condiciones Comerciales

### Diagnóstico
El campo ya existe en el código fuente (línea 557-559 de `NuevoCreadorForm.tsx`), ubicado dentro del grid de 2 columnas justo después de "Periodicidad de Cobro". Sin embargo, es posible que el cambio previo no se haya aplicado correctamente al preview.

### Acción
Re-aplicar el campo en `NuevoCreadorForm.tsx` para asegurar que renderice correctamente:

- **Ubicación**: Inmediatamente después del `<Field>` de "Periodicidad de Cobro" (línea 556), dentro del grid `md:grid-cols-2`
- **Componente**: `<Input>` con placeholder descriptivo
- El campo ocupará la columna derecha, al lado de "Periodicidad de Cobro" en pantallas medianas y grandes

### Archivo
- `src/pages/creadores/NuevoCreadorForm.tsx` — confirmar/re-insertar el campo de dirección de facturación

