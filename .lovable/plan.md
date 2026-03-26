

## Plan: Estado de filtros independiente por tab en Facturación

### Problema
Los filtros `search`, `statusFilter`, `dateFrom`, `dateTo` y `viewMode` son variables de estado globales (líneas 125-135) compartidas entre todos los tabs. Cambiar un filtro en "Invoices" afecta "Notas de Pago" y viceversa.

### Solución
Reemplazar las variables individuales por un objeto de estado indexado por tab. Cada tab mantiene sus propios valores.

### Cambios en `FacturacionPage.tsx`

**1. Definir tipo e inicializar estado por tab (reemplaza líneas 125, 127-129, 135):**
```tsx
type TabFilters = { search: string; statusFilter: string; dateFrom?: Date; dateTo?: Date; viewMode: "list" | "grid" };

const defaultFilters: TabFilters = { search: "", statusFilter: "", dateFrom: undefined, dateTo: undefined, viewMode: "list" };

const [filtersByTab, setFiltersByTab] = useState<Record<FacturaTab, TabFilters>>({
  "Invoices": { ...defaultFilters },
  "Notas de Pago": { ...defaultFilters },
  "Reversos": { ...defaultFilters },
  "Fees & Ajustes": { ...defaultFilters },
  "Mail": { ...defaultFilters },
  "Archivo de PagoMundo": { ...defaultFilters },
});
```

**2. Helper para leer/actualizar filtros del tab activo:**
```tsx
const currentFilters = filtersByTab[facturaTab];
const updateFilter = (patch: Partial<TabFilters>) =>
  setFiltersByTab(prev => ({ ...prev, [facturaTab]: { ...prev[facturaTab], ...patch } }));
```

**3. Reemplazar todas las referencias:**
- `search` → `currentFilters.search`, `setSearch(x)` → `updateFilter({ search: x })`
- `statusFilter` → `currentFilters.statusFilter`, `setStatusFilter(x)` → `updateFilter({ statusFilter: x })`
- `dateFrom/dateTo` → `currentFilters.dateFrom/dateTo`
- `viewMode` → `currentFilters.viewMode`
- `hasFilters` recalculado desde `currentFilters`

**4. Eliminar** las variables individuales `search`, `statusFilter`, `dateFrom`, `dateTo`, `viewMode` (líneas 125, 127-129, 135).

Un solo archivo modificado: `FacturacionPage.tsx`.

