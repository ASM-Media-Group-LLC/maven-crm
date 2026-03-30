

## Plan: Corregir solapamiento de tramos — usar `max + 1` como mínimo del siguiente

### Problema
Cuando se agrega un nuevo tramo, el `min_revenue` se establece igual al `max_revenue` del tramo anterior, causando solapamiento (ej: tramo 1 termina en 999, tramo 2 empieza en 999).

### Cambios en `CommissionTiersEditor.tsx`

Hay 4 puntos donde se calcula el `min` del siguiente tramo que deben usar `max + 1`:

1. **`addTier()` (línea 61-62)**: Cambiar `newMin = max_revenue` → `newMin = max_revenue + 1`
2. **`removeTier()` (línea 71)**: Al recalcular continuidad, usar `max_revenue + 1` en vez de `max_revenue`
3. **`updateTier()` (línea 82)**: Al auto-actualizar el siguiente tramo, usar `value + 1`
4. **`validateTiers()` (línea 34)**: Cambiar la validación de continuidad de `min === prev.max` a `min === prev.max + 1`

### Archivo
- `src/components/commission/CommissionTiersEditor.tsx`

