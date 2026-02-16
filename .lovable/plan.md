
## Fijar la primera columna (Ticket) en scroll horizontal

### Cambio en `src/pages/promolog/PromologTable.tsx`

Se aplicara `sticky left-0` con fondo solido y z-index elevado unicamente a la columna **Ticket** (la primera columna), tanto en el header como en las celdas del body.

**Header (linea 121):**
- Agregar `sticky left-0 z-20 bg-card` al `TableHead` de Ticket
- El z-20 es necesario porque esta celda es sticky tanto en top (por el TableHeader) como en left, y debe quedar por encima del resto

**Celdas del body (linea 134):**
- Agregar `sticky left-0 z-10 bg-card` al `TableCell` de Ticket en cada fila
- El z-10 mantiene la celda sobre las demas columnas al hacer scroll horizontal
- El `bg-card` garantiza fondo solido para que no se vea contenido debajo

### Resumen de clases

| Elemento | Clases a agregar |
|----------|-----------------|
| TableHead (Ticket) | `sticky left-0 z-20 bg-card` |
| TableCell (Ticket) | `sticky left-0 z-10 bg-card` |

El sticky funciona dentro del contenedor `overflow-auto` que ya envuelve la tabla, no del viewport. No afecta la vista grid ni el responsive. La columna Acciones (sticky right) sigue funcionando igual.
