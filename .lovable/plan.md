

## Tickets Module - Mejoras: Filtros, Vistas, Detalle y Acciones CRUD

Mejoras al modulo de Tickets existente: filtros con placeholder descriptivo (patron de Creadores/Eventos), toggle Lista/Grid, modal de detalle con comentarios, y acciones de editar/eliminar.

---

### 1. Migracion SQL - Tabla `ticket_comments`

Se necesita una nueva tabla para soportar los comentarios del detalle del ticket (como se ve en la imagen de referencia):

```text
CREATE TABLE public.ticket_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage ticket comments"
  ON public.ticket_comments FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
```

---

### 2. Archivos nuevos

| Archivo | Proposito |
|---------|-----------|
| `src/pages/tickets/TicketsGrid.tsx` | Vista de tarjetas en grid (4 columnas) con badges de prioridad/estado/tipo, click para abrir detalle |
| `src/pages/tickets/ViewTicketModal.tsx` | Modal de detalle del ticket con info completa (numero, titulo, descripcion, compania, tipo, asignado, status, prioridad) + seccion de comentarios con formulario para agregar |
| `src/pages/tickets/EditTicketModal.tsx` | Modal de edicion reutilizando estructura de CreateTicketModal, pre-poblado con datos existentes |
| `src/pages/tickets/DeleteTicketDialog.tsx` | AlertDialog de confirmacion para eliminar ticket (patron de DeleteContactoDialog) |

---

### 3. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/pages/tickets/TicketsFilters.tsx` | Refactorizar al patron de CreadoresFilters: usar `value \|\| undefined` + `__all__` trick para mostrar placeholder descriptivo ("Prioridad", "Tipo", etc.) en vez de "Todas". Agregar toggle Lista/Grid con iconos List y LayoutGrid |
| `src/pages/tickets/TicketsContent.tsx` | Agregar estado de vista (list/grid), pasar a filtros. Renderizar TicketsList o TicketsGrid segun vista. Eliminar la segunda fila de filtros de fecha (integrar inline) |
| `src/pages/tickets/TicketsList.tsx` | Agregar columna de acciones por ticket: iconos/botones para Ver (Eye), Editar (Pencil), Eliminar (Trash2). Abrir modales correspondientes |
| `src/pages/tickets/useTickets.ts` | Agregar mutations: updateTicket, deleteTicket. Agregar query y mutation para ticket_comments (listar y crear) |

---

### 4. Detalle de componentes

**TicketsFilters.tsx** - Refactorizado:
- Mismo patron que CreadoresFilters/EventosFilters: `value={value || undefined}` + `onValueChange={(v) => onChange(v === "__all__" ? "" : v)}`
- Placeholders descriptivos: "Prioridad", "Tipo", "Estado", "Compania", "Asignado"
- Toggle List/Grid al final (ml-auto)
- Fechas integradas en la misma fila o eliminadas del segundo row

**TicketsGrid.tsx**:
- Grid de 4 columnas (sm:2, md:3, lg:4)
- Cada tarjeta: numero de ticket coloreado, titulo, creador handle, badges (prioridad, estado, tipo), fecha
- Click abre ViewTicketModal
- Botones de accion con stopPropagation (Editar, Eliminar)

**ViewTicketModal.tsx** - Basado en las imagenes de referencia:
- Header: #XXXXXX + Titulo del ticket
- Fecha de creacion formateada
- Seccion "Description" con texto
- "Compania / Cuenta de Origen" con badge
- "Tipo de Ticket" con badge coloreado
- "Asignado a" con selector inline para cambiar asignacion
- "Status" y "Priority" como selects editables inline
- Seccion "Comments" con lista de comentarios (autor, email, contenido, fecha)
- Formulario: textarea "Write a comment..." + boton "Agregar Comentario"
- Footer: botones Editar y Eliminar

**EditTicketModal.tsx**:
- Misma estructura que CreateTicketModal
- Pre-poblado con datos del ticket seleccionado
- Boton "Guardar Cambios" en vez de "Crear Ticket"

**DeleteTicketDialog.tsx**:
- AlertDialog con icono AlertTriangle
- Texto: "Eliminar ticket" + descripcion con titulo del ticket
- Botones: Cancelar / Eliminar (destructive)
- Ejecuta deleteTicket mutation

---

### 5. Flujo de acciones

1. Usuario ve lista o grid de tickets con filtros descriptivos
2. Click en ticket abre ViewTicketModal con toda la info + comentarios
3. Desde el detalle puede cambiar status/prioridad/asignado inline
4. Puede agregar comentarios
5. Boton "Editar" abre EditTicketModal para cambios completos
6. Boton "Eliminar" abre DeleteTicketDialog para confirmacion
7. Desde la lista/grid tambien hay iconos de accion rapida (ver, editar, eliminar)

