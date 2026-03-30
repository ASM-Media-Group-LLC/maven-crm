

## Plan: Mover stats cards arriba de tabs y filtros en LeadGen y Closers

### Problema
En `/contactos` el orden es: **Stats Cards → Tabs → Filtros → Tabla**. Pero en LeadGen y Closers las stats cards están dentro del área scrollable de la tabla (debajo de tabs y filtros), lo cual rompe la consistencia visual.

### Cambios

#### 1. `LeadGenContent.tsx`
- Mover el bloque de `LeadGenCantidadCard` (líneas 317-320) desde dentro del div `flex-1 min-h-0` (línea 316) hacia **arriba**, justo después del header y antes del div de tabs (línea ~230)
- Mantener el wrapper con transición `max-h` para auto-hide
- El `onScroll` en `DataTableShell` sigue funcionando igual para detectar scroll

#### 2. `ClosersContent.tsx`
- Mover el bloque de `ClosersKPICards` (líneas 220-222) desde dentro del div `flex-1 min-h-0` (línea 219) hacia **arriba**, justo antes del div `shrink-0` que contiene TabsList y filtros (línea 105)
- Mantener wrapper con transición `max-h` para auto-hide
- `onScroll` en `DataTableShell` sigue igual

### Resultado esperado
```text
Header
├─ Stats Cards (auto-hide on scroll)  ← movidas aquí
├─ Tabs bar
├─ Filters bar
└─ DataTableShell (scrollable)
```

Consistente con `/contactos` y `/creadores`.

### Archivos a modificar
- `src/pages/leadgen/LeadGenContent.tsx`
- `src/pages/closers/ClosersContent.tsx`

