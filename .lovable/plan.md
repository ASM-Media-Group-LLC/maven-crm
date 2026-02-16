

## Subtareas, Prioridad y Reordenamiento en el Modulo de Tareas

### Resumen

Se agregaran tres funcionalidades al modulo de Tareas:
1. **Subtareas**: tareas hijas dentro de una tarea padre, con fecha de inicio y fin propias
2. **Prioridad**: nivel de prioridad para cada tarea (baja, media, alta, urgente)
3. **Reordenamiento**: arrastrar y soltar las tarjetas de subtareas para reorganizarlas

---

### 1. Cambios en Base de Datos

#### Nueva tabla `subtasks`

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | uuid (PK) | Identificador unico |
| task_id | uuid (FK -> tasks.id) | Tarea padre |
| title | text | Titulo de la subtarea |
| description | text (nullable) | Descripcion opcional |
| status | text (default 'pending') | pending, in_progress, completed |
| position | integer (default 0) | Orden para drag-and-drop |
| started_at | timestamptz (nullable) | Fecha/hora de inicio real |
| completed_at | timestamptz (nullable) | Fecha/hora de finalizacion real |
| created_by | uuid | Usuario que creo la subtarea |
| created_at | timestamptz | Fecha de creacion |
| updated_at | timestamptz | Fecha de actualizacion |

Politicas RLS: mismas que `tasks` - visible para assigned_to o created_by de la tarea padre.

#### Nueva columna en `tasks`

| Columna | Tipo | Default |
|---------|------|---------|
| priority | text | 'medium' |

Valores permitidos: `low`, `medium`, `high`, `urgent`.

---

### 2. Funcionalidad de Subtareas

Se accede a las subtareas desde la vista de detalle de una tarea (al hacer clic en una TaskCard o desde el menu de acciones).

#### Nuevo componente: `SubtasksPanel`
- Se muestra como una seccion expandible dentro de la TaskCard (vista grid) o como un panel lateral/modal al abrir la tarea
- Lista de subtareas ordenadas por `position`
- Cada subtarea muestra: titulo, estado (badge), fecha inicio, fecha fin
- Boton "+" para agregar subtarea inline (input rapido de titulo)
- Acciones por subtarea: marcar inicio, marcar completada, editar, eliminar

#### Nuevo componente: `CreateSubtaskInline`
- Input inline dentro del panel de subtareas
- Solo requiere titulo para creacion rapida
- Opcionalmente expandible para agregar descripcion

#### Nuevo componente: `SubtaskItem`
- Card compacta con titulo, badge de estado y fechas
- Boton para marcar "Iniciar" (registra `started_at`) y "Completar" (registra `completed_at`)
- Indicador visual del progreso (sin iniciar, en progreso, completada)
- Drag handle para reordenar

#### Drag and Drop
- Implementar reordenamiento con el patron de listas ordenadas (actualizar campo `position`)
- Sin dependencias externas: usar eventos nativos de HTML5 drag-and-drop (`draggable`, `onDragStart`, `onDragOver`, `onDrop`)
- Al soltar, se actualiza el campo `position` de las subtareas afectadas en Supabase

---

### 3. Funcionalidad de Prioridad

#### Indicador visual en TaskCard y TasksTable
- Badge de color segun prioridad:
  - Baja: gris/muted
  - Media: azul/primary (default)
  - Alta: naranja/warning
  - Urgente: rojo/destructive
- Icono de bandera junto al badge

#### Selector de prioridad
- Agregado al modal de creacion (`CreateTaskModal`) y edicion (`EditTaskModal`)
- Select con las 4 opciones y sus colores

#### Filtro por prioridad
- Nuevo select en `TareasContent` para filtrar por prioridad
- Opcion de ordenar por prioridad en la tabla

---

### 4. Archivos a crear

| Archivo | Descripcion |
|---------|-------------|
| `src/pages/tareas/useSubtasks.ts` | Hook con queries y mutations para subtareas |
| `src/pages/tareas/SubtasksPanel.tsx` | Panel contenedor de subtareas con drag-and-drop |
| `src/pages/tareas/SubtaskItem.tsx` | Card individual de subtarea |

### 5. Archivos a modificar

| Archivo | Cambios |
|---------|---------|
| `src/pages/tareas/useTareas.ts` | Agregar `priority` al tipo Task y a las mutations |
| `src/pages/tareas/TaskCard.tsx` | Agregar badge de prioridad y seccion de subtareas expandible |
| `src/pages/tareas/TasksTable.tsx` | Agregar columna de prioridad con ordenacion |
| `src/pages/tareas/CreateTaskModal.tsx` | Agregar selector de prioridad |
| `src/pages/tareas/EditTaskModal.tsx` | Agregar selector de prioridad |
| `src/pages/tareas/TareasContent.tsx` | Agregar filtro de prioridad |
| Migracion SQL | Crear tabla `subtasks` y columna `priority` en `tasks` |

---

### 6. Flujo de usuario

1. El usuario crea una tarea y selecciona su prioridad (baja/media/alta/urgente)
2. Al abrir una TaskCard, ve una seccion de subtareas desplegable
3. Agrega subtareas con un input rapido
4. Marca "Iniciar" en una subtarea (registra fecha de inicio)
5. Marca "Completar" en una subtarea (registra fecha de finalizacion)
6. Arrastra y suelta subtareas para reorganizar su orden
7. Las tarjetas muestran un indicador de progreso (ej: "2/5 subtareas completadas")

