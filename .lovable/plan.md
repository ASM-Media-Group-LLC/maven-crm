

## Mejoras avanzadas en subtareas: estados, fechas y asignacion

### Resumen

Ampliar la gestion de subtareas para incluir: flujo completo de estados (pendiente, en progreso, pausada, completada), fecha de inicio planificada, fecha limite, y asignacion mejorada. Todo visible directamente en cada fila de subtarea sin necesidad de abrir modales.

---

### Cambios en base de datos

Se necesita agregar una columna `start_at` a la tabla `subtasks` para la fecha de inicio planificada (distinta de `started_at` que registra cuando realmente se inicio).

| Columna | Tipo | Proposito |
|---------|------|-----------|
| `start_at` | timestamp with time zone, nullable | Fecha de inicio planificada por el usuario |

Migracion SQL:
```sql
ALTER TABLE subtasks ADD COLUMN start_at timestamp with time zone;
```

---

### Flujo de estados

Los estados disponibles seran:

| Estado | Badge | Transiciones posibles |
|--------|-------|-----------------------|
| Pendiente (`pending`) | Gris/secondary | Iniciar, Completar |
| En progreso (`in_progress`) | Azul/primary | Pausar, Completar |
| Pausada (`paused`) | Amarillo/warning | Reanudar, Completar |
| Completada (`completed`) | Verde/emerald | (estado final) |

En lugar de botones individuales por estado, se usara un **dropdown de estado** clickeable directamente en la fila, con iconos y colores para cada opcion. Esto reemplaza los botones Play/CheckCircle actuales.

---

### Cambios por archivo

| Archivo | Cambio |
|---------|--------|
| **Nueva migracion** | Agregar columna `start_at` a `subtasks` |
| `src/integrations/supabase/types.ts` | Actualizar tipo generado si es necesario (el cast `as any` actual lo maneja) |
| `src/pages/tareas/useSubtasks.ts` | Actualizar interface `Subtask` con `start_at`. Actualizar `createSubtask` para recibir `start_at`. Actualizar `updateSubtaskFields` para recibir `start_at` y `status`. Agregar logica de `paused` en `updateSubtaskStatus`. |
| `src/pages/tareas/SubtaskItem.tsx` | Redisenar la fila: (1) Reemplazar botones Play/Complete por un dropdown de estado con 4 opciones. (2) Mostrar fecha inicio y fecha fin lado a lado. (3) Mostrar asignado con avatar/nombre. (4) En modo edicion, agregar campo de fecha inicio ademas de fecha fin. |
| `src/pages/tareas/SubtasksPanel.tsx` | Agregar campo "Fecha inicio" al formulario de creacion (un segundo datepicker junto al de "Fecha fin"). Renombrar el datepicker actual de "Fecha" a "Fin". |

---

### Detalle tecnico

#### 1. Dropdown de estado en SubtaskItem

Reemplazar los botones de accion (Play, CheckCircle) por un `DropdownMenu` que muestra el badge de estado actual como trigger:

```text
[v Pendiente]  -->  click  -->  | Iniciar       |
                                | Completar     |

[v En progreso] --> click -->   | Pausar        |
                                | Completar     |

[v Pausada]    -->  click  -->  | Reanudar      |
                                | Completar     |

[v Completada] -->  (sin menu, estado final)
```

Cada opcion actualiza el status y los timestamps correspondientes:
- "Iniciar": status=in_progress, started_at=now()
- "Pausar": status=paused (no borra started_at)
- "Reanudar": status=in_progress
- "Completar": status=completed, completed_at=now()

#### 2. Fechas de inicio y fin en la fila

La fila mostrara dos fechas:
- Icono calendario + "Inicio: dd/MM/yy" (de `start_at`, planificado por el usuario)
- Icono calendario + "Fin: dd/MM/yy" (de `due_at`, deadline)

Si alguna no esta definida, no se muestra.

#### 3. Formulario de creacion actualizado

El formulario en SubtasksPanel tendra:

```text
[  Nueva subtarea...  ] [Prioridad v] [Inicio] [Fin] [Asignar] [+]
```

Dos datepickers: uno para `start_at` (placeholder "Inicio") y otro para `due_at` (placeholder "Fin").

#### 4. Formulario de edicion actualizado

En modo edicion de SubtaskItem, agregar:
- Campo de estado (Select con las 4 opciones)
- Datepicker de fecha de inicio
- Datepicker de fecha fin (ya existente, renombrado)
- Asignacion con buscador (ya existente)

