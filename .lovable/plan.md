

## Mejoras a la pagina de Monitoreo

Se corregiran los filtros, se agregara el selector de fechas (DateRangePicker), la vista de calendario y el boton de Configurar API con modal preparado para Hubstaff.

---

### 1. Selector de fechas (DateRangePicker)

Agregar el componente `DateRangePicker` en la fila de filtros, siguiendo el patron de `HRIncidents.tsx`. Permitira filtrar agentes por rango de fechas (preparado para cuando se conecte Hubstaff y se tengan datos historicos). Con mock data, el filtro estara presente visualmente pero no afectara los resultados hasta que haya datos reales con timestamps.

---

### 2. Corregir placeholders de Select

Cambiar el patron de los selectores para que:
- El `value` del Select use `undefined` cuando esta vacio (en lugar de `"all"`)
- El placeholder muestre la categoria del filtro: "Estado" y "Rol" en lugar de "Todos los estados"
- La opcion "Todos" use el valor centinela `__all__` mapeado a cadena vacia en el estado
- La logica de filtrado trate cadena vacia como ausencia de filtro

Ejemplo:
```text
// Antes
value={statusFilter}  // "all"
<SelectItem value="all">Todos los estados</SelectItem>

// Despues
value={statusFilter || undefined}  // undefined cuando vacio
placeholder="Estado"
<SelectItem value="__all__">Todos</SelectItem>
```

---

### 3. Vista de Calendario

Agregar una tercera vista (list/grid/calendar) con el boton `CalendarDays` en el toggle de vistas, siguiendo el patron exacto de `HRSchedules.tsx`:

- Calendario mensual con navegacion de meses (flechas izquierda/derecha)
- Cada celda del dia muestra indicadores de color por estado de los agentes que tuvieron actividad ese dia
- Leyenda de colores: Activo (verde), Inactivo (amarillo), Desconectado (gris), En Pausa (azul)
- Vista de semana actual debajo del calendario mensual

Con datos mock, se mostrara actividad simulada distribuida en los dias del mes actual.

---

### 4. Modal de Configurar API (Hubstaff)

Reemplazar el toast de "Proximamente" por un modal/dialog real con:
- Titulo: "Configurar Integracion Hubstaff"
- Campo para API Token de Hubstaff (input password)
- Campo para Organization ID
- Boton de "Probar Conexion" (mostrara toast "Proximamente - conexion real")
- Boton de "Guardar Configuracion" (deshabilitado por ahora)
- Nota informativa indicando que la integracion real esta en desarrollo

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRMonitoring.tsx` | Agregar DateRangePicker, corregir selects, agregar vista calendario, agregar modal configurar API, cambiar view state a `"list" \| "grid" \| "calendar"` |

---

### Detalle tecnico

**Select filters**: El estado `statusFilter` iniciara como `""` (cadena vacia). El `value` del Select sera `statusFilter || undefined` para que el placeholder sea visible. La opcion "Todos" usara `value="__all__"` y el `onValueChange` mapeara `__all__` a `""`.

**Vista calendario**: Se agregaran estados `calMonth` (Date) para navegacion mensual. Se generara un grid de 7 columnas (Lun-Dom) con celdas por cada dia del mes. Cada celda mostrara bolitas de color representando el estado de cada agente activo ese dia. Con mock data, se simulara actividad para los ultimos 5-7 dias.

**DateRangePicker**: Se importara de `@/components/ui/date-range-picker` con estados `dateFrom` y `dateTo`. Se colocara en la fila de filtros junto a los selects.

**Modal API**: Se usara el componente Dialog de Shadcn con inputs para token y org ID. Los botones estaran preparados pero sin funcionalidad real hasta la integracion con Hubstaff.

