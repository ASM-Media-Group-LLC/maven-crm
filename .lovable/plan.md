

## Refactor: DateRangePicker + Ganancia en una fila

**Archivo**: `src/pages/finanzas/comisiones/NuevaComisionModal.tsx`

### Cambios

1. **Importar** `DateRangePicker` desde `@/components/ui/date-range-picker`
2. **Reemplazar** los dos bloques de Fecha Inicio / Fecha Fin (líneas 144-174) y el bloque de Ganancia Total (líneas 176-180) por una sola fila con `grid grid-cols-2 gap-4`:
   - Columna 1: `DateRangePicker` con `from={periodStart}`, `to={periodEnd}`, `onApply` que setea ambos estados
   - Columna 2: Input de Ganancia Total (USD)
3. **Eliminar** imports innecesarios (`Calendar`, `Popover/PopoverContent/PopoverTrigger`, `CalendarIcon`) si ya no se usan en otro lugar del archivo
4. Agregar label "Período" encima del DateRangePicker y "Ganancia Total (USD)" encima del input

### Layout resultante

```text
[ Creador (full width)                          ]
[ Período (DateRangePicker) ][ Ganancia Total   ]
[ Cálculo Automático panel                      ]
[ Cancelar ][ Guardar ]
```

