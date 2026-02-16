

## Mejorar experiencia de subtareas y confirmar drag-and-drop

### Problemas identificados

1. **Formulario de creacion de subtareas oculto**: Los campos de prioridad, fecha limite y asignacion estan escondidos detras de un boton chevron (`showOptions`). El usuario debe hacer clic extra para acceder a ellos, lo que hace que no sea obvio que existen.

2. **No se pueden editar subtareas existentes**: Una vez creada, una subtarea solo puede iniciarse, completarse o eliminarse. No hay forma de cambiar su titulo, prioridad, fecha o asignacion.

3. **Drag-and-drop de proyectos y tareas**: Ya esta implementado correctamente usando `DraggableGrid` tanto en `ProjectsListContent` (proyectos) como en `TareasContent` (tareas). Ambos persisten el orden via `reorderProjects` y `reorderTasks`. Si no funciona visualmente, puede ser un problema de feedback visual que mejoraremos.

---

### Cambios planificados

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/SubtasksPanel.tsx` | Mostrar campos de prioridad, fecha y asignacion siempre visibles en linea con el input de titulo (eliminar el toggle `showOptions`) |
| `src/pages/tareas/SubtaskItem.tsx` | Agregar boton de editar y modal/inline editing para modificar titulo, prioridad, fecha y asignacion de subtareas existentes |
| `src/pages/tareas/DraggableGrid.tsx` | Mejorar feedback visual del drag-and-drop (cursor grab visible, indicador de posicion de drop) |

---

### Detalle tecnico

#### 1. Formulario de subtareas siempre visible

Eliminar el estado `showOptions` y el boton chevron. Reorganizar el formulario para mostrar todos los campos en una sola fila compacta:

```
[Input titulo] [Select prioridad] [Boton fecha] [Select asignar] [+ Agregar]
```

- Los selects usan el mismo tamano compacto actual (`h-7 text-xs`)
- En pantallas pequenas, los campos se envuelven con `flex-wrap`
- Se mantiene el atajo Enter para crear rapido

#### 2. Edicion inline de subtareas

Agregar un boton de editar (icono Pencil) en `SubtaskItem` que aparece en hover junto al boton de eliminar. Al hacer clic:

- El titulo se convierte en un input editable inline
- Los campos de prioridad, fecha y asignacion se muestran debajo como selects editables
- Un boton "Guardar" confirma los cambios usando `updateSubtaskFields` (que ya existe en `useSubtasks`)
- Un boton "Cancelar" o Escape descarta los cambios
- Se usa el mutation `updateSubtaskFields` existente para prioridad/fecha/asignacion, y se agregara soporte para actualizar el titulo

#### 3. Actualizar titulo de subtarea

El hook `useSubtasks` ya tiene `updateSubtaskFields` pero no soporta cambiar el titulo. Se agregara `title` como campo editable en el mutation existente.

#### 4. Mejorar feedback visual de drag-and-drop

En `DraggableGrid`:
- Agregar icono `GripVertical` visible en hover en cada card de proyecto/tarea
- Mejorar el indicador visual durante el arrastre (borde mas prominente, sombra sutil)

En `TaskCard` y la card de proyecto en `ProjectsListContent`:
- Agregar el icono de agarre como primer elemento visual

