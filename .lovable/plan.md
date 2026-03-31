

## Plan: Reducir calendario + auto-hide al scroll en /eventos

### Problema
El calendario y la card de próximos eventos ocupan demasiado espacio vertical (~400px), dejando poco espacio para la tabla de datos. No hay auto-hide al hacer scroll.

### Cambios

**1. Compactar EventosCalendar (`EventosCalendar.tsx`)**
- Reducir el calendario: celdas más pequeñas (`h-8` en vez de `h-10`), padding reducido
- Limitar "Próximos eventos" a 3 items máximo, con card height reducida (`max-h-[280px]`)
- Reducir padding general y tipografía

**2. Auto-hide con ratchet en EventosContent (`EventosContent.tsx`)**
- Aplicar el mismo patrón ratchet usado en LeadGen/Closers/Promolog:
  - Estado `statsCollapsed` que se activa al scrollear > 40px
  - Se resetea solo al cambiar tabs de proyecto/status
  - El calendario + próximos eventos se oculta con `hidden` cuando colapsado
- Mover el scroll container para que envuelva tabs + filtros + tabla, y el `onScroll` detecte el desplazamiento
- Añadir transición suave con `overflow-hidden` y `max-h` animado

**3. Estructura resultante**
```text
<main flex-col>
  <header shrink-0>  ← fijo siempre
  <calendar>         ← se oculta al scroll > 40px
  <scroll-container> ← tabs + filtros + tabla (onScroll aquí)
```

### Detalles técnicos

**EventosContent.tsx:**
```tsx
const [statsCollapsed, setStatsCollapsed] = useState(false);

const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
  if (e.currentTarget.scrollTop > 40) {
    setStatsCollapsed(true);
  }
}, []);

// Reset al cambiar tab
const updateFilters = (patch: Partial<EventoFilters>) => {
  setStatsCollapsed(false);
  setFilters((prev) => ({ ...prev, ...patch }));
};
```

El calendario se envuelve en un div con transición:
```tsx
<div className={cn(
  "transition-all duration-300 overflow-hidden",
  statsCollapsed ? "max-h-0 opacity-0 mb-0" : "max-h-[500px] opacity-100 mb-4"
)}>
  <EventosCalendar events={allEvents} />
</div>
```

**EventosCalendar.tsx:**
- `h-10` → `h-8` en day cells
- `max-h-[360px]` → `max-h-[260px]` en próximos eventos
- `.slice(0, 4)` → `.slice(0, 3)` para mostrar menos items
- Reducir padding de `p-5` a `p-4`

