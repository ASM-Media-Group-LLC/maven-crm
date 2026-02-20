
## Correcciones en AgentDetailView — Filtros de la pestaña Leads

### Problemas identificados

**1. Selector de fecha incorrecto**
El filtro de fecha es un `<Select>` simple con opciones fijas (Todos / Hoy / Ayer / Semana), controlado por `filterFecha = "hoy"`. Debe reemplazarse por el `DateRangePicker` ya usado en Eventos, Promolog y otros módulos.

**2. Filtros con "Todos" visible como valor inicial (bug de consistencia)**
Los selectores de Calidad y Estado usan `value="todos"` como estado inicial, lo que hace que el trigger muestre "Todos" en lugar del placeholder descriptivo. El patrón correcto del sistema es `value=""` (vacío) + placeholder descriptivo, y "Todos" aparece solo dentro del dropdown como opción de reset.

```
// MAL — muestra "Todos" en el trigger
const [filterCalidad, setFilterCalidad] = useState("todos");
<SelectValue placeholder="Calidad" />  ← nunca se ve porque hay un value

// BIEN — muestra "Calidad" en el trigger
const [filterCalidad, setFilterCalidad] = useState("");
<SelectValue placeholder="Calidad" />  ← se ve correctamente
```

---

### Cambios en `src/pages/leadgen/AgentDetailView.tsx`

**Estado inicial de filtros (líneas 49-51):**
```tsx
// Antes
const [filterCalidad, setFilterCalidad] = useState("todos");
const [filterEstado, setFilterEstado] = useState("todos");
const [filterFecha, setFilterFecha] = useState("hoy");

// Después
const [filterCalidad, setFilterCalidad] = useState("");
const [filterEstado, setFilterEstado] = useState("");
const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date());
const [dateTo, setDateTo] = useState<Date | undefined>(new Date());
```

**Lógica de filtrado por fecha (líneas 83-88):**
```tsx
// Antes — comparación por string
if (filterFecha === "hoy") result = result.filter(...)
else if (filterFecha === "ayer") result = result.filter(...)

// Después — comparación por rango de fechas real
if (dateFrom) result = result.filter(l => new Date(l.created_at) >= startOfDay(dateFrom));
if (dateTo) result = result.filter(l => new Date(l.created_at) <= endOfDay(dateTo));
```

**Lógica de filtrado por calidad y estado (líneas 89-90):**
```tsx
// Antes
if (filterCalidad !== "todos") result = result.filter(...)
if (filterEstado !== "todos") result = result.filter(...)

// Después
if (filterCalidad) result = result.filter(l => l.categoria?.toLowerCase() === filterCalidad);
if (filterEstado) result = result.filter(l => l.status?.toLowerCase() === filterEstado);
```

**UI de filtros (líneas 226-282):**
- Quitar el bloque `<CalendarDays>` + `<Select>` de fecha
- Añadir `<DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />`
- En los selectores de Calidad y Estado: cambiar el value de `"todos"` a `""` y mantener placeholder descriptivo
- El item "Todos" del dropdown pasa a disparar `""` en onValueChange (igual que en el resto del sistema)

**Imports a añadir:**
- `DateRangePicker` desde `@/components/ui/date-range-picker`
- `endOfDay` desde `date-fns`
- Quitar `CalendarDays` de lucide-react (ya no se usa)

---

### Archivos a modificar

| Archivo | Cambios |
|---|---|
| `src/pages/leadgen/AgentDetailView.tsx` | Reemplazar filtro de fecha por DateRangePicker; corregir estado inicial de Calidad y Estado a `""`; actualizar lógica de filtrado |

