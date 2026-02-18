

## Reemplazar selector de fecha en LeadGen por DateRangePicker

### Descripcion

Reemplazar el selector simple de fecha (Select con opciones Hoy/Ayer/Semana/Mes) en la barra de filtros de LeadGen por el componente `DateRangePicker` utilizado en Promolog, con el placeholder "Selecciona fechas".

Tambien se verifico que en Promolog todas las instancias del `DateRangePicker` (Promos, Agentes, Campanas) usan correctamente `placeholder="Selecciona fechas"` -- estan bien.

---

### Cambios en `src/pages/leadgen/LeadGenContent.tsx`

#### 1. Imports
- Agregar: `import { DateRangePicker } from "@/components/ui/date-range-picker";`

#### 2. Estado nuevo
- Agregar dos estados para el rango de fechas:
  - `dateFrom: Date | undefined`
  - `dateTo: Date | undefined`

#### 3. Reemplazo del selector de fecha (lineas 145-157)
- Eliminar el bloque del icono `CalendarDays` + `Select` con opciones Hoy/Ayer/Semana/Mes
- Reemplazar por:
```tsx
<DateRangePicker
  from={dateFrom}
  to={dateTo}
  onApply={(from, to) => { setDateFrom(from); setDateTo(to); }}
  placeholder="Selecciona fechas"
  className="h-9"
/>
```

Esto replica exactamente el comportamiento de Promolog: un boton que dice "Selecciona fechas" y al hacer click abre el modal con presets rapidos (Hoy, Ayer, Esta semana, etc.), calendario dual y entrada manual.

### Resultado de la verificacion de Promolog

Las tres pestanas de Promolog (Promos, Agentes, Campanas) usan `placeholder="Selecciona fechas"` correctamente. No se requiere ningun cambio en Promolog.
