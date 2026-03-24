

## Plan: Rediseñar vistas de compartir agenda y evento individual

### Referencia visual

**Imagen 1 (Agenda compartida)**: Layout de 2 columnas — izquierda con calendario compacto + filtros de proyecto debajo, derecha con lista de "Proximos Eventos" agrupados por dia, cada evento como card con hora, icono de tipo, nombre, badge de tipo, duracion, ubicacion, avatares de invitados con conteo y estado.

**Imagen 2 (Evento compartido)**: Vista de detalle sin confirmacion/RSVP. Hero con badge de proyecto + nombre + tipo. Grid 2x2 con cards de Fecha, Horario, Ubicacion, Invitados. Seccion de Notas del Evento con borde lateral. Lista de invitados con avatar, nombre, handle de Instagram y estado. Botones de Google Calendar, Apple Calendar y .ics al final.

### Cambios

#### 1. `SharedAgendaPage.tsx` — Rediseño a 2 columnas como la imagen

- Layout principal: `grid lg:grid-cols-[380px_1fr]`
- **Columna izquierda** (sticky): Calendario compacto (ya existe) + seccion "PROYECTOS" debajo con los filtros de proyecto como pills de colores (mover de la posicion actual)
- **Columna derecha**: Header "PROXIMOS EVENTOS" con linea decorativa, luego eventos agrupados por dia con `DayHeader` (numero grande + dia de semana + mes + badge de conteo)
- **Event cards rediseñados**: Cada card muestra hora inicio/fin a la izquierda, barra de color del tipo, icono + nombre + badge de tipo + duracion + ubicacion, fila de avatares con conteo de invitados y estado (confirmado/pendiente)
- Quitar el search bar del header (no aparece en la imagen como input, solo como placeholder visual)
- Simplificar el header: solo logo "Maven CRM" + search input centrado
- Quitar el toggle de tema (no aparece en la referencia)
- Quitar las secciones expandidas de guests dentro de cada card — solo mostrar avatares apilados + "X invitados" + estado resumido

#### 2. `EventoSharePage.tsx` — Rediseño como vista de detalle (sin RSVP)

- **Eliminar toda la seccion de RSVP**: quitar el segundo `<Card>` con seleccion de invitado, botones de confirmar/cancelar, formulario de cancelacion
- **Eliminar estados**: `selectedGuest`, `submitting`, `done`, `showCancelForm`, `cancelReason` y el handler `handleAction`
- **Eliminar la pantalla de "done"** (confirmed/cancelled)
- **Nuevo layout**:
  - Badge de proyecto con dot de color arriba
  - Titulo grande del evento
  - Tipo de evento con icono
  - Grid 2x2 con cards de: Fecha (dia completo + año), Horario (hora inicio — hora fin + duracion calculada), Ubicacion (nombre + "Direccion"), Invitados (conteo + estado resumido)
  - Seccion "NOTAS DEL EVENTO" con borde lateral amarillo/accent y texto de descripcion
  - Seccion "INVITADOS" con lista de invitados: avatar con iniciales, nombre, @handle de Instagram, dot de estado + label
  - Fila de 3 botones: Google Calendar, Apple Calendar, .ics (descarga de archivo ICS)
- **Botones de calendario funcionales**: generar URLs de Google Calendar y Apple Calendar, y un blob download para .ics

### Archivos a modificar
1. `src/pages/eventos/SharedAgendaPage.tsx` — rediseño completo a 2 columnas
2. `src/pages/eventos/EventoSharePage.tsx` — quitar RSVP, agregar detalle completo + botones de calendario

