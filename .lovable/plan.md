

## Plan: Scroll interno, paginador y auto-hide en AgentDetailView

### Problema
`AgentDetailView` usa un solo `div.overflow-auto` (línea 170) que envuelve todo el contenido (KPI cards, quality cards, tabs, tabla). Esto hace que:
1. La tabla no tenga scroll interno propio — todo scrollea junto
2. No hay auto-hide de las stats cards al scrollear la tabla
3. El `DataTableShell` no tiene altura restringida (`flex-1 min-h-0`) para activar su scroll interno

### Cambios

#### 1. Reestructurar layout (`AgentDetailView.tsx`)
- Cambiar el div `flex-1 overflow-auto` (línea 170) a `flex-1 flex flex-col min-h-0` (sin overflow-auto propio)
- KPI cards y quality cards: envolverlas en un `shrink-0` con transición `max-h` + `opacity` controlada por `statsCollapsed`
- Tab bar: `shrink-0`
- Tab content (leads): cambiar de `div.p-6` a `flex-1 flex flex-col min-h-0 p-6` para que el DataTableShell ocupe el espacio restante
- El `DataTableShell` ya existe (línea 292) — agregarle `onScroll={handleContentScroll}` y envolverlo en un contenedor `flex-1 min-h-0`

#### 2. Agregar estado y handler de auto-hide
- `useState(false)` para `statsCollapsed`
- `handleContentScroll` igual que en LeadGenContent: `scrollTop > 40` → collapse, `scrollTop < 10` → expand
- Pasar `onScroll` al `DataTableShell`

#### 3. Ajustar contenedor del DataTableShell
- Agregar `className="flex-1 min-h-0"` al DataTableShell para que use todo el espacio vertical disponible y active su scroll interno

### Resultado
```text
Header (shrink-0)
├─ KPI Cards (shrink-0, auto-hide on scroll)
├─ Quality Cards (shrink-0, auto-hide on scroll)
├─ Tab bar (shrink-0)
└─ Tab content (flex-1 min-h-0)
   └─ Filters (shrink-0)
   └─ DataTableShell (flex-1 min-h-0, scroll interno, onScroll → auto-hide)
```

### Archivo a modificar
- `src/pages/leadgen/AgentDetailView.tsx`

