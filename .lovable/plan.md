

## Tickets - Reemplazar lista de tarjetas por tabla estandar

Reemplazar el componente `TicketsList.tsx` actual (basado en Cards) por una tabla estandar que siga exactamente el mismo patron de CreadoresTable y EventosTable: tabla con columnas ordenables, header sticky, columna de acciones sticky right, y scroll interno con altura calculada.

---

### 1. Archivo modificado: `src/pages/tickets/TicketsList.tsx`

Reescritura completa del componente. Reemplazar la lista de Cards por una tabla con el patron estandar:

**Estructura de la tabla:**

| Columna | Contenido | Ordenable |
|---------|-----------|-----------|
| Ticket | #XXXXXX (coloreado por prioridad) + titulo | Si |
| Creador | @handle del creador vinculado | Si |
| Prioridad | Badge (Urgente/Alta/Media/Baja) | Si |
| Tipo | Badge (Queja/Tecnico/Facturacion/Contenido/General) | Si |
| Estado | Badge (Abierto/En Progreso/Resuelto/Cerrado) | Si |
| Compania | Badge outline con nombre de compania | Si |
| Asignado | @handle del asignado o "Sin asignar" | Si |
| Fecha | Fecha formateada dd MMM yyyy | Si |
| Acciones | Botones Eye, Pencil, Trash2 (sticky right) | No |

**Patrones a seguir (de CreadoresTable):**
- Contenedor: `max-h-[calc(100vh-24rem)] overflow-auto rounded-lg border border-border`
- TableHeader: `sticky top-0 z-10 bg-card`
- Columna Acciones header: `sticky right-0 bg-card z-20`
- Columna Acciones celda: `sticky right-0 bg-card`
- SortHeader con ArrowUpDown icon y Button ghost
- Estado de sort local con `sortKey` y `sortAsc`
- Fila clickeable para abrir detalle (onClick en la fila o en la primera celda)
- Acciones con `stopPropagation`
- Empty state con `colSpan` completo

**Filas urgentes:** Las filas de tickets con prioridad "urgent" tendran una clase visual sutil (`bg-destructive/5`) para destacarlas en la tabla.

---

### 2. Sin cambios en otros archivos

`TicketsContent.tsx` ya pasa correctamente las props `onView`, `onEdit`, `onDelete` al componente `TicketsList`, por lo que no necesita cambios. La interfaz Props del componente se mantiene identica.

