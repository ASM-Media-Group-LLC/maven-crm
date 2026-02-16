

## Reemplazar el date picker simple por el DateRangePicker del sistema de diseno

Actualmente el Promolog usa un `Calendar` con `mode="single"` dentro de un Popover manual. La imagen y el requerimiento piden poder seleccionar un dia o un rango de dias. El proyecto ya tiene el componente `DateRangePicker` estandarizado que soporta ambos casos (seleccionar un solo dia = from y to iguales, o un rango completo).

### Cambios en `src/pages/promolog/PromologContent.tsx`

1. **Reemplazar el estado `date`** por dos estados `dateFrom` y `dateTo` (ambos `Date | undefined`), inicializados al dia de hoy.

2. **Eliminar el Popover + Calendar manual** (lineas 285-299) y reemplazarlo por el componente `DateRangePicker` ya existente:
   ```text
   <DateRangePicker
     from={dateFrom}
     to={dateTo}
     onApply={(from, to) => { setDateFrom(from); setDateTo(to); }}
   />
   ```

3. **Eliminar imports innecesarios**: `Calendar`, `Popover`, `PopoverContent`, `PopoverTrigger` (si no se usan en otro lugar del archivo), y `CalendarDays`.

4. **Agregar import** de `DateRangePicker` desde `@/components/ui/date-range-picker`.

5. **Actualizar la logica de filtrado** de entries para que filtre por rango (`dateFrom` <= fecha entrada <= `dateTo`) en lugar de comparar con un solo dia. Si solo se selecciona un dia (from === to), se comporta igual que antes.

6. **Eliminar el estado `open`** ya que el DateRangePicker maneja su propio popover internamente.

### Beneficios

- Reutiliza el componente estandarizado del sistema de diseno con presets rapidos (Hoy, Ayer, Esta semana, etc.)
- Permite seleccionar un solo dia o un rango
- Mantiene consistencia visual con el resto de la plataforma (Eventos, Sales Overview, Sales Dashboard)
