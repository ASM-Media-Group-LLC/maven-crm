

## Horarios y Turnos - Modulo Completo

### Resumen

Construir la seccion "Horarios y Turnos" con una pagina principal y dos sub-paginas internas (Horas Extras y Banco de Horas), siguiendo los mockups proporcionados y los patrones estandar del modulo HR.

### Nuevas tablas en la base de datos

#### Tabla `work_schedules`

Almacena turnos programados.

| Columna | Tipo | Default | Nullable |
|---|---|---|---|
| id | uuid | gen_random_uuid() | No |
| title | text | - | No |
| schedule_type | text | 'manana' | No |
| start_date | date | - | No |
| end_date | date | - | No |
| start_time | time | - | Yes |
| end_time | time | - | Yes |
| department_id | uuid | - | Yes |
| description | text | - | Yes |
| created_by | uuid | - | Yes |
| created_at | timestamptz | now() | No |
| updated_at | timestamptz | now() | No |

RLS: Authenticated users can manage (ALL, true).

#### Tabla `hour_bank`

Registra movimientos del banco de horas (depositos y retiros).

| Columna | Tipo | Default | Nullable |
|---|---|---|---|
| id | uuid | gen_random_uuid() | No |
| employee_id | uuid | - | No |
| hours | numeric | - | No |
| movement_type | text | 'deposit' | No |
| reason | text | - | Yes |
| reference_date | date | CURRENT_DATE | No |
| created_by | uuid | - | Yes |
| created_at | timestamptz | now() | No |

RLS: Authenticated users can manage (ALL, true). FK: employee_id -> employees(id).

### Nuevos archivos

#### 1. `src/pages/hr/HRSchedules.tsx` - Pagina principal

Basado en los mockups (imagen 127, 128, 130):

- **Header**: "Horarios y Turnos" con botones "Ver Calendario" (outline) y "+ Crear Turno" (default)
- **4 KPI Cards**: Turnos Esta Semana, Turnos Hoy, Horas Extra (link "Ver"), Banco de Horas (link "Ver")
- **Tab bar departamentos**: Todos + departamentos activos (patron estandar Button-based)
- **2 Cards de navegacion**: "Horas Extras" y "Banco de Horas" como cards clickeables con flechas (navegan a sub-paginas)
- **Filtros**: Buscar, Select tipo, DateRangePicker
- **Toggle vista**: Lista / Grid / Calendario
- **Vista Tabla** (imagen 128): Titulo, Tipo (badge), Fecha Inicio, Fecha Fin, Descripcion, Creado por, Acciones (Ver, Editar, Eliminar)
- **Vista Grid**: Cards con la misma info
- **Vista Calendario** (imagen 130): Calendario mensual con leyenda de colores por tipo de turno (Manana/Tarde/Noche/Flexible), sidebar "Proximos Turnos"
- **Semana Actual**: Rejilla semanal (LUN-DOM) mostrando turnos programados
- **Modal Crear/Editar Turno** (imagen 129): Titulo, Tipo de turno (Select), Fecha Inicio, Fecha Fin, Hora Inicio, Hora Fin, Departamento, Descripcion
- **AlertDialog Eliminar**: Confirmacion estandar
- **CRUD completo**: Queries y mutations contra `work_schedules`

#### 2. `src/pages/hr/HROvertimeDetail.tsx` - Sub-pagina Horas Extras

Basado en mockup (imagen 131):

- **Header**: Flecha atras + "Horas Extras" + boton "+ Registrar Horas Extra"
- **4 KPI Cards**: Total Horas, Pendientes, Aprobadas, Pagadas
- **Filtros**: Buscar, Select estado (Todos/Pendiente/Aprobado/Rechazado/Pagado)
- **Toggle vista**: Lista / Grid
- **Vista Tabla**: Empleado (avatar+nombre+email), Fecha, Horas, Tasa, Razon, Estado (badge), Acciones (Aprobar/Rechazar si pending, Ver, Editar, Eliminar)
- **Vista Grid**: Cards con misma info
- **Modal Registrar/Editar**: Empleado (combobox), Tipo (OVERTIME_TYPES), Fecha, Horas, Tasa multiplicadora, Razon
- **AlertDialog Eliminar**
- **CRUD completo** contra tabla `overtime` existente

#### 3. `src/pages/hr/HRHourBank.tsx` - Sub-pagina Banco de Horas

Basado en mockup (imagen 132):

- **Header**: Flecha atras + "Banco de Horas" + botones "Registrar Uso" (outline) y "+ Agregar Horas" (default)
- **4 KPI Cards**: Total Acumulado, Promedio por Empleado, Balance Alto (+30h), Balance Bajo (-10h)
- **Tabs internas**: "Balances" / "Movimientos"
- **Tab Balances**: Tabla con Empleado, Balance (Xh / 40h), Progreso (barra), Ultimo Mov., Acciones (Ver)
- **Tab Movimientos**: Tabla con Empleado, Tipo (deposito/retiro), Horas, Razon, Fecha, Acciones (Ver, Editar, Eliminar)
- **Modal Agregar Horas**: Empleado, Horas, Razon (movement_type = deposit)
- **Modal Registrar Uso**: Empleado, Horas, Razon (movement_type = withdrawal)
- **CRUD completo** contra tabla `hour_bank`

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| **DB Migration** | Crear tablas `work_schedules` y `hour_bank` con RLS |
| `src/pages/hr/HRSchedules.tsx` | **Nuevo** - Pagina principal Horarios y Turnos |
| `src/pages/hr/HROvertimeDetail.tsx` | **Nuevo** - Sub-pagina Horas Extras |
| `src/pages/hr/HRHourBank.tsx` | **Nuevo** - Sub-pagina Banco de Horas |
| `src/App.tsx` | Agregar 3 rutas: `/hr/horarios`, `/hr/horarios/horas-extras`, `/hr/horarios/banco-horas` |
| `src/components/dashboard/DashboardSidebar.tsx` | Cambiar "Horarios y Turnos" de `url: null` a `url: "/hr/horarios"` |

### Patron de acciones en tablas

Todas las tablas incluiran las 3 acciones estandar:

```text
Turnos:     [ Eye (ver) ] [ Pencil (editar) ] [ Trash2 (eliminar) ]
Overtime:   [ Check/X (aprobar/rechazar si pending) ] [ Eye (ver) ] [ Pencil (editar) ] [ Trash2 (eliminar) ]
Hour Bank:  [ Eye (ver) ] [ Pencil (editar) ] [ Trash2 (eliminar) ]
```

### Secuencia de implementacion

1. Migracion de base de datos (tablas + RLS)
2. Crear los 3 archivos de pagina en paralelo
3. Actualizar App.tsx y DashboardSidebar.tsx
