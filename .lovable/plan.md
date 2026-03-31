

## Plan: Auto-hide stats cards en Promolog al hacer scroll

### Cambio

Aplicar el mismo patrón de colapso de KPI cards que existe en LeadGen y Closers: cuando el usuario hace scroll en la tabla, las stats cards se ocultan con una transición suave.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `PromologContent.tsx` | Agregar state `statsCollapsed`, callback `handleContentScroll`, transición CSS en el div de KPI cards, y pasar `onScroll` al `DataTableShell` |

### Detalle

1. **Nuevo state + callback** (junto a los otros states, ~línea 420):
```tsx
const [statsCollapsed, setStatsCollapsed] = useState(false);
const handleContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
  setStatsCollapsed(e.currentTarget.scrollTop > 40);
}, []);
```

2. **KPI cards div** (línea 477): cambiar de clase fija a transición dinámica:
```tsx
// Antes
<div className="shrink-0 px-6 pt-4 pb-2">

// Después  
<div className={`shrink-0 px-6 pt-4 transition-all duration-300 overflow-hidden ${statsCollapsed ? "max-h-0 opacity-0 py-0 pb-0" : "max-h-[200px] opacity-100 pb-2"}`}>
```

3. **DataTableShell** (línea 610): agregar `onScroll`:
```tsx
<DataTableShell onScroll={handleContentScroll} ...>
```

4. Importar `useCallback` (ya está importado `useRef`, agregar `useCallback` al import de react en línea 1).

