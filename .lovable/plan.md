

## Plan: Botón "Agregar Creador" para closers y KPI cards con datos propios

### Problema
1. El botón "Agregar Creador" está oculto para closers (línea 67: `{!isCloser && ...}`) — debería mostrarse
2. Las KPI cards muestran stats globales (284 total, 95 activas, etc.) en vez de solo los datos del closer
3. La card "En Onboarding" no aplica para closers — debe ocultarse

### Cambios

#### 1. `CreadoresContent.tsx`
- Quitar la condición `!isCloser` del botón "Agregar Creador" (línea 67) para que siempre se muestre
- Calcular `closerStatusCounts` a partir de `allCreators` filtrado (que ya solo tiene los del closer) y pasarlo a `CreadoresKPICards` en vez de `statusCounts` cuando es closer

#### 2. `CreadoresKPICards.tsx`
- Recibir prop `isCloser?: boolean`
- Si `isCloser`, filtrar el array `cards` para excluir "En Onboarding"
- Ajustar grid a `lg:grid-cols-5` cuando hay 5 cards

### Archivos a modificar
- `src/pages/creadores/CreadoresContent.tsx`
- `src/pages/creadores/CreadoresKPICards.tsx`

