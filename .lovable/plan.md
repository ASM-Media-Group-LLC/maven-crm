

## Plan: Corregir acciones, popovers y ContactCountCell

### Problemas identificados

1. **"Mover a Asignada" en acciones**: En tab "todas" (línea 747), `CLOSER_STAGES` incluye "Asignada" como opción de cambio de estado. No tiene sentido — si se asigna, ya se mueve automáticamente. Hay que excluirla del dropdown.

2. **ContactCountCell no funcional**: El error en consola dice `Function components cannot be given refs` — el `<Badge>` dentro de `<PopoverTrigger asChild>` no acepta `ref`. Además, los `<Select>` de Canal/Resultado dentro del Popover cierran el Popover al interactuar (conflicto Radix Select + Popover). Solución: usar `<button>` en vez de `<Badge>` como trigger, y agregar `modal={true}` al Popover para que no se cierre al interactuar con Selects internos.

3. **Inline selects para todas las filas**: Los Popovers usan Portal así que no deberían cortarse. El problema potencial es que `InlineStageSelect` usa `<Select>` de Radix que podría tener conflictos de z-index dentro de tablas con `overflow-x-auto`. Verificar que `SelectContent` tenga `position="popper"` y z-index adecuado.

### Cambios

**`src/pages/closers/components/LeadTable.tsx`**

- **Línea 747**: Filtrar "Asignada" del dropdown de acciones en tab "todas": `CLOSER_STAGES.filter((s) => s !== c.stage && s !== "Asignada")`
- **Línea 585-591 (tab asignadas)**: Verificar que no haya opción redundante de "Mover a Asignada" (ya está bien, solo tiene Confirmada y No interesada)
- **ContactCountCell (líneas 231-319)**: 
  - Cambiar `<Badge>` trigger por un `<button>` con estilos de badge para que acepte ref
  - Agregar `modal` al `<Popover>` para evitar que los Select internos cierren el popover
  - Esto soluciona tanto el error de ref como la interacción con los selects de Canal/Resultado
- **InlineStageSelect**: Agregar `side="bottom"` y `position="popper"` al `SelectContent` para asegurar que se despliegue hacia abajo correctamente
- **InlineCategorySelect / InlineSourceSelect**: Agregar `side="bottom"` al `PopoverContent` para forzar despliegue hacia abajo

### Archivos a modificar
- `src/pages/closers/components/LeadTable.tsx` — Todos los fixes descritos arriba

