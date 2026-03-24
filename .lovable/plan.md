

## Plan: Fix paginador en LeadGen y scroll interno en tabs Agentes/Supervisores/Rendimiento

### Problemas

1. **Tab "Leads" sin paginador visible**: `DataTableShell` recibe `totalCount={filteredLeads.length}` y `pageSize={50}`, pero el fetch usa `PAGE_SIZE=100`. Como `filteredLeads.length` es <= 100 (una página), `totalPages` calcula como 1 y el paginador no aparece. Debe usar `totalCount={totalLeads}` (el count real del servidor) y `pageSize={100}` para que coincida con el fetch.

2. **Tabs Agentes/Supervisores/Rendimiento sin scroll**: El contenedor padre es `flex-1 min-h-0 flex flex-col` pero el contenido de estos tabs no tiene `overflow-auto`. El contenido crece más allá del viewport y no se puede hacer scroll down.

### Cambios

#### `src/pages/leadgen/LeadGenContent.tsx`

**Fix paginador (tab leads)**:
- Línea 353: Cambiar `totalCount={filteredLeads.length}` → `totalCount={totalLeads}`
- Línea 354: Cambiar `pageSize={50}` → `pageSize={100}` (para coincidir con el fetch real)

**Fix scroll en tabs agentes/supervisores/rendimiento**:
- Línea 367: Envolver el contenido del tab "agentes" en `<div className="flex-1 min-h-0 overflow-auto">` en lugar del `<div className="space-y-6">` actual (combinar: `flex-1 min-h-0 overflow-auto space-y-6`)
- Línea 478-479: Envolver `LeadGenSupervisorView` en `<div className="flex-1 min-h-0 overflow-auto">`
- Línea 483-484: Envolver `LeadGenPerformanceView` en `<div className="flex-1 min-h-0 overflow-auto">`

### Archivos
1. `src/pages/leadgen/LeadGenContent.tsx` — 4 cambios puntuales

