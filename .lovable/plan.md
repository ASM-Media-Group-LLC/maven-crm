

## Estandarizar Pagina de Incidentes al Layout de Referencia

La pagina actual de Incidentes (`HRIncidents.tsx`) no sigue el layout estandarizado que tienen las demas secciones como Control de Asistencia. A continuacion los problemas y la solucion.

### Problemas detectados

| Elemento | Estado actual | Estado esperado (como Asistencia) |
|---|---|---|
| Layout raiz | `div p-6` simple | `flex flex-col h-full overflow-hidden` con header fijo y scroll independiente |
| KPI Cards | `Card` basico con `border-t` | `DashboardMetricCard` con hover premium (scale, gradiente, border semantico) |
| Buscador | No existe | Input con icono Search y placeholder "Buscar empleado..." |
| Pestanas de departamento | No existen | Tabs por departamento (Todos, Direccion, Finanzas, etc.) |
| Filtros de fecha | No existen | Popover con Calendar para "Desde" y "Hasta" |
| Toggle vista | No existe | Botones List/Grid para alternar entre tabla y tarjetas |
| Tabla | Sin scroll interno, sin sticky header/actions | Contenedor con `max-h`, `sticky top-0` en header, `sticky right-0` en acciones |
| Contador | No existe | "Mostrando X de Y registros" al pie |
| Vista Grid | No existe | Grid de tarjetas con datos del incidente |

### Cambios en `src/pages/hr/HRIncidents.tsx`

**1. Layout fijo con scroll**
- Raiz: `flex flex-col h-full overflow-hidden`
- Header: `shrink-0 bg-background border-b px-6 pt-6 pb-4`
- Contenido: `flex-1 overflow-auto p-6 space-y-5`

**2. KPIs con DashboardMetricCard**
- Reemplazar los Card basicos por `DashboardMetricCard` con iconos (AlertTriangle, AlertCircle, Clock, ShieldAlert) y hover effects premium identicos a los de Asistencia

**3. Pestanas de departamento**
- Consultar tabla `departments` (mismo hook `useDepartments` de Asistencia)
- Filtrar incidentes por `employees.department_id`
- Barra de tabs: Todos + departamentos activos

**4. Barra de filtros completa**
- Buscador por nombre de empleado (Input con Search icon)
- Select de Severidad (placeholder, sin "Todos" visible por defecto)
- Select de Estado (placeholder)
- Date pickers "Desde" y "Hasta" (Popover + Calendar)
- Toggle de vista List/Grid (iconos ListIcon y LayoutGrid)
- Boton "Limpiar filtros" condicional

**5. Tabla estandarizada**
- Contenedor con `overflow-auto max-h-[calc(100vh-28rem)]`
- TableHeader con `sticky top-0 z-10 bg-card`
- Columna Acciones con `sticky right-0 bg-card`
- Columna Empleado con avatar (iniciales + nombre + codigo)
- Row hover: `group hover:bg-muted/30 transition-colors`

**6. Vista Grid**
- Tarjetas con datos del incidente: empleado, tipo, severidad (badge), fecha, estado, titulo truncado
- Acciones Eye/Pencil/Trash2 en cada tarjeta
- Grid responsivo `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`

**7. Contador de resultados**
- "Mostrando X de Y incidentes" debajo de la tabla/grid

### Archivo a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRIncidents.tsx` | Refactorizar completamente para seguir el patron de Asistencia |

### Sin cambios en DB ni rutas
Todo es puramente visual/layout. No se requieren migraciones ni nuevas rutas.

