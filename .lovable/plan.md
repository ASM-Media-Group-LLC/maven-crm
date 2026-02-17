

## Reemplazar "Desde/Hasta" por DateRangePicker en Customer Service

### Cambio

Reemplazar los dos inputs de fecha separados ("Desde" y "Hasta") en la segunda fila de filtros por el componente `DateRangePicker` que ya se usa en Eventos y Sales Overview, manteniendo consistencia visual en toda la app.

### Archivos a modificar

**`src/pages/tickets/TicketsFilters.tsx`**
- Eliminar la segunda fila completa (lineas 144-163) con los inputs "Desde" y "Hasta"
- Importar `DateRangePicker` de `@/components/ui/date-range-picker` y `format` de `date-fns`
- Colocar el `DateRangePicker` en la primera fila de filtros, entre el select de "Asignado" y el boton "Limpiar filtros"
- Adaptar las props: convertir los strings `dateFrom`/`dateTo` a `Date` para el componente, y en `onApply` formatear de vuelta a string `yyyy-MM-dd`

**`src/pages/tickets/TicketsContent.tsx`**
- Sin cambios necesarios: las props `dateFrom`, `dateTo` y sus setters ya existen y seguiran funcionando igual

### Resultado

Los filtros de Tickets pasaran de tener dos filas (selectores + inputs de fecha) a una sola fila con el `DateRangePicker` integrado, igual que en Eventos.

