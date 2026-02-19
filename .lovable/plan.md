
## Rediseño de cards "Cantidad" y "Estados" + funcionalidad de filtro

### Problema actual
Las dos cards tienen un diseño denso y poco visual:
- **Cantidad**: usa `border-l-[3px]` + icono de Users + Progress bar todo junto, resultando en filas cargadas y poco legibles.
- **Estados**: filas planas sin distinción visual entre estados.
- **Ninguna es interactiva**: no filtran la tabla de leads al hacer clic.

### Nuevo diseño propuesto

**Card "Cantidad"** — chips compactos con badge de número grande y % en secundario:
```
┌─────────────────────────────────────────────┐
│  CANTIDAD                                   │
│  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐   │
│  │  A+   │ │   A   │ │  B+   │ │   B   │   │
│  │  12   │ │  28   │ │   8   │ │   5   │   │
│  │  24%  │ │  56%  │ │  16%  │ │  10%  │   │
│  └───────┘ └───────┘ └───────┘ └───────┘   │
│  ┌───────┐ ┌────────────┐ ┌────────────┐   │
│  │   C   │ │   Total    │ │     QA     │   │
│  │   3   │ │     50     │ │     7      │   │
│  └───────┘ └────────────┘ └────────────┘   │
└─────────────────────────────────────────────┘
```
Cada chip es clickeable. Al seleccionarse se resalta con el color de su categoría y fondo tintado.

**Card "Estados"** — filas con dot de color, número grande a la derecha y hover interactivo:
```
┌──────────────────────────────────────────┐
│  ESTADOS                                 │
│  ● Respondieron .............. 18  →     │
│  ● Interesadas ............... 12  →     │
│  ● No interesadas ............  5  →     │
│  ● Otros .....................  3  →     │
│  ✆ Con Teléfono ..............  8  →     │
└──────────────────────────────────────────┘
```
Cada fila es clickeable. Al seleccionarse cambia a `bg-muted` con borde izquierdo coloreado.

### Funcionalidad de filtro

Se añade estado `activeFilter` en `LeadGenContent.tsx`:
```typescript
const [activeFilter, setActiveFilter] = useState<{type: "categoria" | "status" | null; value: string | null}>({type: null, value: null});
```

Al hacer clic en un chip/fila de las cards:
- Si ya está activo ese filtro → se desactiva (toggle).
- Si no → se activa.

Los leads que se pasan a `LeadGenTable` y `LeadGenGrid` se filtran:
```typescript
const filteredLeads = leads.filter(lead => {
  if (activeFilter.type === "categoria") return lead.categoria?.toLowerCase() === activeFilter.value;
  if (activeFilter.type === "status") return /* mapeo de status */;
  return true;
});
```

Las cards reciben `activeFilter` y un callback `onFilterChange` como props para poder mostrar visualmente qué está seleccionado.

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/leadgen/LeadGenCantidadCard.tsx` | Rediseño visual con chips en grid 2D + lógica de selección activa |
| `src/pages/leadgen/LeadGenEstadosCard.tsx` | Rediseño visual con filas interactivas + lógica de selección activa |
| `src/pages/leadgen/LeadGenContent.tsx` | Añadir `activeFilter` state, filtrar `leads` antes de pasarlos a tabla/grid, y pasar props a las cards |

### Mapeo de filtros de Estados a `status` de BD

| Chip de UI | Valores de `status` en BD |
|---|---|
| Respondieron | `contactado`, `respondio` |
| Interesadas | `interesado` |
| No interesadas | `no_interesado` |
| Otros | cualquier status no reconocido |
| Con Teléfono | leads con número en `notas` (filtro especial) |
