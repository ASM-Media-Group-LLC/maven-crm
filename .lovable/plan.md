
# Plan: 4 mejoras al módulo de Tareas

## 1. Stats cards siempre arriba (fix de regresión)

Las KPI cards (progreso + contadores) en `TareasContent.tsx` deben estar siempre visibles independientemente de la vista activa (kanban/lista/analíticas). Actualmente ya están arriba del viewMode conditional, así que esto parece correcto. **Verificar** que no se movieron accidentalmente — si están dentro del bloque condicional, sacarlas.

**Archivo**: `TareasContent.tsx` — confirmar que las cards (líneas 280-311) están FUERA del bloque `viewMode === "analytics"` (línea 388).

## 2. Reemplazar Burndown por Gantt en Analíticas

En `TaskAnalyticsTab.tsx`, eliminar el chart de Burndown (líneas 85-112 data + líneas 175-195 JSX) y reemplazarlo con un diagrama Gantt real usando Recharts `BarChart` horizontal con barras posicionadas por fechas.

**Archivo**: `TaskAnalyticsTab.tsx`
- Eliminar `burndownData` useMemo y su renderizado
- Crear `ganttChartData` que calcule para cada tarea: offset desde la fecha más temprana (como posición X) y duración en días (como largo de barra)
- Renderizar como `BarChart` horizontal con `XAxis` como línea temporal (días) y `YAxis` como nombres de tareas
- Usar colores de status para las barras
- Mantener el timeline simplificado existente (líneas 197-224) o reemplazarlo por este nuevo Gantt más completo

## 3. Creación inline de tareas en Kanban

Agregar un botón "+" al final de cada columna del Kanban que al clickear muestre un input inline para crear tareas rápidamente con título y asignación directa al status de esa columna.

**Archivo**: `TaskKanbanView.tsx`
- Agregar props: `onCreateTask` callback y `profiles` ya está
- Después de `{provided.placeholder}`, agregar un mini-form inline: input de título + botón crear
- Al crear, se pasa el status de la columna automáticamente (ej: si está en "En curso", se crea con status `in_progress`)
- El form es minimal: solo título, el resto usa defaults (prioridad medium, duración 1h, due date +24h)

**Archivo**: `TareasContent.tsx`
- Pasar `onCreateInline` al `TaskKanbanView` que llame a `createTask.mutate` con el status apropiado

**Archivo**: `useTareas.ts`
- Ajustar `createTask` mutation para aceptar un `status` opcional en los params

## 4. Gestión de miembros del proyecto en el header

Agregar en el header de `TareasContent.tsx` la capacidad de gestionar miembros del proyecto (agregar/quitar) usando un Popover con el patrón estándar de Command/Combobox.

**Archivo**: `TareasContent.tsx`
- Importar `useProjectMembers`
- Agregar un botón/icono `Users` junto al líder del proyecto
- Al clickear, abrir un Popover con la lista de profiles, checkbox para agregar/quitar miembros
- Usar `setProjectMembers` mutation del hook existente
- Mostrar avatares de los miembros actuales como chips debajo del líder

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `TaskAnalyticsTab.tsx` | Reemplazar Burndown por Gantt chart con Recharts |
| `TaskKanbanView.tsx` | Agregar inline task creation por columna |
| `TareasContent.tsx` | Pasar onCreateInline al kanban + agregar gestión de miembros en header |
| `useTareas.ts` | Aceptar status opcional en createTask |

## Sin migraciones DB ni dependencias nuevas
Todo usa componentes y hooks existentes.
