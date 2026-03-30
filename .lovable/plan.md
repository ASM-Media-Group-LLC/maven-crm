

## Plan: Agregar auto-hide de stats cards en tabs leads-hora y rendimiento

### Problema
Solo el tab "leads" (DataTableShell) pasa `onScroll={handleContentScroll}`. Los tabs "leads-hora" y "rendimiento" usan `<div className="flex-1 min-h-0 overflow-auto">` sin `onScroll`, por lo que las stats cards nunca se ocultan al scrollear en esos tabs.

### Cambios en `LeadGenContent.tsx`

1. **Tab "leads-hora"** (línea 324): agregar `onScroll={handleContentScroll}` al div wrapper
2. **Tab "rendimiento"** (línea 488): agregar `onScroll={handleContentScroll}` al div wrapper

Cambio mínimo — solo agregar el handler a los 2 divs existentes.

### Archivo a modificar
- `src/pages/leadgen/LeadGenContent.tsx` — líneas 324 y 488

