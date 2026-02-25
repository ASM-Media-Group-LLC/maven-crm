

## Plan: Hacer la hora opcional en todos los selectores de fecha de tareas

### Problema actual

En los modales de crear y editar tareas, el selector de hora (`Select` con `TIME_OPTIONS`) aparece siempre junto al calendario, dando la impresion de que es obligatorio. Lo mismo en el componente inline `InlineDateTimeEdit`. La prioridad debe ser seleccionar la fecha; la hora solo aplica para tareas de corta duracion.

### Cambios propuestos

#### 1. `CreateTaskModal.tsx` — Hora opcional con placeholder claro

- Mantener el `Select` de hora junto al calendario, pero cambiar el placeholder de `"Hora"` a `"Sin hora"`
- Agregar un boton pequeno de limpiar (X) dentro del trigger cuando hay hora seleccionada, para poder quitar la hora
- En la logica de submit: si no hay hora seleccionada, usar `23:59` para fecha fin y `00:00` para fecha inicio (ya funciona asi)
- Cambiar el hint de `"Si no se indica hora, se usará 23:59"` a algo mas claro como `"Hora opcional — sin hora se usa fin de día"`

#### 2. `EditTaskModal.tsx` — Mismo tratamiento

- Mismo cambio de placeholder `"Sin hora"` en ambos selects de hora
- Agregar boton de limpiar hora en cada select
- Inicializar `endTime` como `""` en lugar de `"18:00"` si la hora almacenada es `23:59` (indicando que no se especifico hora)
- Inicializar `startTime` como `""` si la hora es `00:00`

#### 3. `InlineDateTimeEdit.tsx` — Hora opcional con boton limpiar

- Cambiar el default de `selectedTime` de `"12:00"` a `""` cuando no hay valor previo
- Agregar opcion `"Sin hora"` como primer item del Select o un boton de limpiar
- Cuando se aplica sin hora: usar `23:59` para `due_at` y `00:00` para `start_at`
- En el trigger, mostrar solo la fecha sin hora cuando no se especifico hora (`dd/MM/yy` en vez de `dd/MM/yy HH:mm`)

#### 4. Display en tablas y vistas

- En `TasksTable.tsx` y `TaskListRow.tsx`: cuando la hora almacenada sea `23:59:xx` (due_at) o `00:00:xx` (start_at), mostrar solo la fecha sin hora, indicando visualmente que no se especifico hora

### Archivos a modificar

| Archivo | Cambios |
|---------|---------|
| `src/pages/tareas/CreateTaskModal.tsx` | Placeholder "Sin hora", boton limpiar hora, hint actualizado |
| `src/pages/tareas/EditTaskModal.tsx` | Placeholder "Sin hora", boton limpiar hora, init inteligente de hora |
| `src/pages/tareas/InlineDateTimeEdit.tsx` | Default sin hora, opcion limpiar, display condicional fecha/hora |
| `src/pages/tareas/TasksTable.tsx` | Display condicional: solo fecha si hora es default |
| `src/pages/tareas/TaskListRow.tsx` | Display condicional: solo fecha si hora es default |

