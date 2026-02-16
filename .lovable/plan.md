

## Quitar el sticky horizontal de la columna Ticket

### Cambio

En `src/pages/promolog/PromologTable.tsx`, eliminar `sticky left-0 z-20 bg-card` de la columna Ticket tanto en el header como en las celdas del body.

| Ubicacion | Cambio |
|-----------|--------|
| TableHead de Ticket (linea ~119) | `sticky left-0 z-20 bg-card` -> (sin sticky) |
| TableCell de Ticket (linea ~131) | `sticky left-0 z-10 bg-card` -> (sin sticky) |

La columna Ticket se comportara como cualquier otra columna normal y se desplazara junto con el contenido horizontal.

