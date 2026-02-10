

# Nueva Seccion: Eventos

## Resumen

Crear una seccion completa de Eventos siguiendo el mismo patron arquitectonico de Creadores: tabla de base de datos, hook de datos, filtros, vistas tabla/grid, acciones por fila y formulario de creacion. Ademas incluye un calendario mensual con proximos eventos en el header.

## 1. Base de datos - Crear tabla `events`

Migracion SQL para crear la tabla con los campos que se ven en las imagenes:

```text
events
-------
id             uuid PK default gen_random_uuid()
name           text NOT NULL
event_type     text NOT NULL  (Shooting, Podcast, Casting, Reunion, Otro)
description    text
date           date NOT NULL
end_date       date           (para eventos multi-dia)
start_time     time
end_time       time
location       text
max_capacity   integer
status         text default 'upcoming'  (upcoming, in_progress, completed, cancelled, rescheduled)
notes          text
created_by     uuid
created_at     timestamptz default now()
updated_at     timestamptz default now()
```

Tabla relacionada para invitados:

```text
event_guests
-------
id             uuid PK default gen_random_uuid()
event_id       uuid NOT NULL references events(id) on delete cascade
creator_id     uuid references creators(id)
guest_name     text           (para invitados externos)
guest_type     text default 'creator'  (creator, external)
status         text default 'pending'  (pending, confirmed, declined)
created_at     timestamptz default now()
```

## 2. Estructura de archivos

```text
src/pages/
  Eventos.tsx                    -- Page wrapper (patron Creadores.tsx)
  NuevoEvento.tsx                -- Page wrapper para crear evento
  eventos/
    EventosContent.tsx           -- Layout principal con calendario + filtros + tabla/grid
    EventosCalendar.tsx          -- Calendario mensual + panel "Proximos eventos"
    EventosFilters.tsx           -- Barra de filtros (buscar, tipo, horario, fechas, toggle vista)
    EventosTable.tsx             -- Vista tabla con sorting en todas las columnas
    EventosGrid.tsx              -- Vista grid con tarjetas
    NuevoEventoForm.tsx          -- Formulario de creacion de evento
    useEventos.ts                -- Hook con queries, mutations y filtros
```

## 3. Sidebar - Agregar enlace "Eventos"

Agregar al `mainMenu` en `DashboardSidebar.tsx`:

```text
mainMenu = [
  Dashboard,
  Creadores,
  Eventos (icono: CalendarDays)   <-- NUEVO
]
```

## 4. Rutas

Agregar en `App.tsx`:

- `/eventos` -> `<Eventos />`
- `/eventos/nuevo` -> `<NuevoEvento />`

## 5. EventosContent (pagina principal)

Estructura segun la imagen de referencia:

```text
+------------------------------------------------------------------+
| Eventos                                    [+ Crear Evento]       |
| Gestiona tus eventos y sesiones de contenido                     |
+------------------------------------------------------------------+
| [Calendario Mensual]          | Proximos eventos                 |
| febrero 2026  < Hoy >        |  - Shoot Kash... (Proximo)       |
| lu ma mi ju vi sa do          |  - Shoot Naira... (Proximo)      |
| ...                           |  - Casting... (Proximo)          |
| 10 eventos este mes           |                                  |
+-------------------------------+----------------------------------+
| [Todos] Proximos  En curso  Completados  Cancelados  Reagendados |
+------------------------------------------------------------------+
| Q Buscar eventos...  [Tipo v] [Horario v] [Fechas]  [=] [:::]   |
+------------------------------------------------------------------+
| 30 eventos                                                        |
| Evento | Tipo | Fecha | Ubicacion | Estado | Notas | Invitados   |
| ...                                                               |
+------------------------------------------------------------------+
```

### Componentes detallados:

**EventosCalendar**: Card con dos columnas (2/3 + 1/3). Izquierda: calendario con react-day-picker (ya instalado) mostrando puntos en dias con eventos y contador "X eventos este mes". Derecha: lista de proximos 3 eventos con icono Camera, nombre truncado, tiempo relativo y badge "Proximo".

**Filtros de estado**: Patron tab-navigation existente (inline-flex bg-muted/50 p-1 con botones secondary/ghost): Todos, Proximos, En curso, Completados, Cancelados, Reagendados.

**EventosFilters**: Mismo patron que CreadoresFilters - barra con Input de busqueda, Select de Tipo, Select de Horario (Manana/Tarde/Noche), DatePicker para rango de fechas, y toggle tabla/grid.

**EventosTable**: Columnas con sorting: Evento (icono + nombre), Tipo, Fecha (relativa), Ubicacion, Estado (badge con colores), Notas (truncadas), Invitados (icono Users + conteo), Acciones (dropdown con "...").

**Acciones dropdown** (segun imagen-12): Ver detalles, Editar, Compartir, Eliminar (destructivo).

**EventosGrid**: Tarjetas verticales con icono de tipo, nombre, fecha, ubicacion, estado badge y conteo de invitados. Patron hover identico a CreadoresGrid.

## 6. NuevoEventoForm (crear evento)

Layout de dos columnas (segun imagen-13/14):

**Columna izquierda** - Card "Informacion del Evento":
- Nombre del Evento (Input, requerido)
- Tipo de Evento (Select con icono: Shooting, Podcast, Casting, Reunion, Otro)
- Descripcion (Textarea)
- Toggle "Evento de multiples dias" (Switch)
- Fecha (Calendar / react-day-picker, requerido)
- Desde / Hasta (Selects de hora y minutos)
- Duracion calculada automaticamente
- Ubicacion (Input)
- Capacidad Maxima (Input numerico, opcional)

**Columna derecha** - Card "Invitados (0)":
- Boton "+ Agregar Invitados"
- Empty state con icono Users: "Sin invitados" / "Agrega creadoras, contactos o invitados externos"

**Header**: Link "Volver a Eventos" con flecha, titulo "Crear Evento", subtitulo.
**Footer**: Boton "Guardar Evento" (primary).

## 7. Hook useEventos

Sigue el patron de useCreadores:
- `fetchEventos()` - query a Supabase con conteo de invitados
- `useEventos(filters)` - filtra por busqueda, tipo, estado, rango de fechas
- `useAddEvento()` - mutation para insertar evento
- `useDeleteEvento()` - mutation para eliminar
- `useUpdateEvento()` - mutation para actualizar

## 8. Mapeo de estados y badges

```text
upcoming     -> "Proximo"    -> primary-soft (azul)
in_progress  -> "En curso"   -> warning-soft (amarillo)
completed    -> "Completado" -> success-soft (verde)
cancelled    -> "Cancelado"  -> destructive-soft (rojo)
rescheduled  -> "Reagendado" -> secondary-soft (gris)
```

## 9. Mapeo de tipos de evento e iconos

```text
Shooting  -> Camera
Podcast   -> Mic
Casting   -> Users
Reunion   -> Video
Otro      -> CalendarDays
```

## Seccion tecnica

- Se usa `react-day-picker` (ya instalado) para el calendario mensual y el date picker del formulario
- Se usa `date-fns` (ya instalado) para formateo de fechas relativas ("hace 2 horas", "en 2 dias")
- Todas las columnas de la tabla tienen sorting (requisito del design system)
- Toasts via `useToast` del sistema (no sonner)
- localStorage no es necesario; los datos persisten en Supabase
- El formulario usa estados locales (mismo patron que NuevoCreadorForm)

