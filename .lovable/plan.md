

## Modulo de Tickets - Customer Service en Operaciones

Nuevo modulo independiente para gestionar todos los tickets de soporte, accesible desde el sidebar. La tabla `tickets` ya existe en la base de datos con RLS configurada, por lo que no se necesitan migraciones SQL.

---

### 1. No se requiere migracion SQL

La tabla `tickets` ya existe con las columnas necesarias: `id`, `creator_id`, `title`, `description`, `priority`, `status`, `ticket_type`, `company`, `assigned_to`, `creator_notes`, `created_at`, `updated_at`. Las RLS policies ya estan configuradas con acceso completo para usuarios autenticados.

---

### 2. Archivos nuevos

| Archivo | Proposito |
|---------|-----------|
| `src/pages/Tickets.tsx` | Pagina wrapper (mismo patron que Closers.tsx) con SidebarProvider, DashboardSidebar y Topbar |
| `src/pages/tickets/TicketsContent.tsx` | Layout principal: header "Customer Service" + subtitulo + boton "Nuevo Ticket", filtros, y lista de tickets |
| `src/pages/tickets/TicketsList.tsx` | Lista de tickets con tarjetas mostrando: numero de ticket, titulo, creador, asignado, descripcion, fecha, compania, badges de prioridad y estado |
| `src/pages/tickets/CreateTicketModal.tsx` | Modal para crear ticket (reutiliza la logica del existente pero sin requerir `creatorId`, todo en espanol). Campos: Titulo, Descripcion, Prioridad (Baja/Media/Alta/Urgente), Tipo (Queja/Tecnico/Facturacion/Contenido/General), Compania (Ora Miami/KASH Agency/alvaroletshoot/Blu app/piclink.me/Pagomundo), Asignar a (lista de ~37 miembros), Notas |
| `src/pages/tickets/useTickets.ts` | Hook con query para listar todos los tickets (con join a creators para mostrar nombre) y mutation para crear tickets |
| `src/pages/tickets/TicketsFilters.tsx` | Barra de filtros: busqueda por texto, selectores de prioridad/tipo/estado/compania/asignado, rango de fechas |

---

### 3. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/App.tsx` | Agregar ruta `/tickets` con import y ProtectedRoute |
| `src/components/dashboard/DashboardSidebar.tsx` | Agregar enlace "Tickets" en la seccion Operaciones (icono Ticket) |

---

### 4. Detalle de componentes

**TicketsContent.tsx** - Basado en la imagen de referencia:
- Header: "Customer Service" + "Gestion de soporte y escalaciones" + boton "+ Nuevo Ticket"
- Tabs: "Lista de Tickets" y "Calendario" (calendario como placeholder)
- Barra de filtros: campo de busqueda + selectores multiples
- Rango de fechas: "Desde" / "Hasta"
- Contador de tickets: "X tickets"
- Listado vertical de tarjetas de tickets

**TicketsList.tsx** - Cada tarjeta de ticket muestra:
- Numero de ticket (formato #XXXXXX con color por prioridad)
- Titulo en negrita
- "Creado por: @handle" y "Asignado a: @handle o Sin asignar"
- Descripcion/preview del contenido
- Fecha de creacion formateada
- Badge de compania (si existe)
- Badges de prioridad (Urgente=destructive, Alta=warning, Media=primary, Baja=secondary) y estado (Abierto, En Progreso, Resuelto, Cerrado)
- Tickets urgentes con fondo sutil de alerta (como en la imagen)

**CreateTicketModal.tsx** - Todo en espanol:
- Titulo: "Crear Nuevo Ticket"
- Subtitulo: "Completa el formulario para crear un ticket de escalacion"
- Campos: Titulo, Descripcion, Prioridad (Baja/Media/Alta/Urgente), Tipo de Ticket (Queja/Tecnico/Facturacion/Contenido/General), Compania/Cuenta de Origen, Asignar a (lista completa de miembros), Notas sobre el creator
- Botones: "Cancelar" y "Crear Ticket"
- El campo `creator_id` sera opcional en este contexto (se puede crear sin vincularlo a un creador especifico, o agregar un selector de creador)

**TicketsFilters.tsx**:
- Input de busqueda con placeholder "Buscar por titulo, descripcion, numero de ticket..."
- Selectores: Prioridad (Todas/Baja/Media/Alta/Urgente), Tipo (Todos), Estado (Todas), Compania (Todas), Asignado (Todos)
- Date range: Desde / Hasta

---

### 5. Consideracion sobre creator_id

La tabla `tickets` tiene `creator_id` como NOT NULL. Para el modulo independiente de Tickets, necesitaremos una de estas opciones:
- Agregar un selector de creador en el modal (Select que carga la lista de creators desde Supabase)
- O modificar la columna a nullable

La opcion recomendada es agregar un selector de creador en el modal, ya que los tickets siempre estan relacionados con un creador. Se agregara un campo "Creador" con un select que lista todos los creadores disponibles.

