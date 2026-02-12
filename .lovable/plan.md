

# Mejorar Layout de Comparacion en DashboardFilters

## Resumen
Reorganizar la seccion de periodos para que cuando el modo comparacion este activo, ambos selectores (Periodo A y Periodo B) aparezcan lado a lado en la misma fila, en lugar de tener el Periodo B en una fila separada debajo.

## Cambio

### Modificar `src/pages/sales-dashboard/DashboardFilters.tsx`

Cuando `compareMode` esta activo, reemplazar el indicador estatico de fecha (el div con icono Calendar) y la fila separada de Periodo B por un grupo inline que muestre:

```text
[Ayer][Hoy][Esta semana][Este mes]   |Periodo A: [DateRangePicker]| vs |Periodo B: [DateRangePicker]|   [Net/Gross] [X Cerrar]
```

Cambios concretos:

1. **Cuando `compareMode` es true**: Reemplazar el div estatico de "Periodo A" por un `DateRangePicker` real (o mantenerlo como label readonly) con etiqueta "Periodo A:", y colocar a su derecha la etiqueta "vs" seguida de otro `DateRangePicker` con etiqueta "Periodo B:". Todo en la misma fila.

2. **Eliminar la fila separada** del Periodo B (lineas 129-141) ya que ambos periodos estaran en la fila principal.

3. **Cuando `compareMode` es false**: Mantener el comportamiento actual (solo el indicador de fecha estatico).

Layout resultante en modo comparacion:
- Fila 1: View tabs
- Fila 2: Time period tabs | `Periodo A: 01 feb - 12 feb` **vs** `Periodo B: [DateRangePicker]` | select Net/Gross | boton Cerrar

## Archivo a modificar
- `src/pages/sales-dashboard/DashboardFilters.tsx`

