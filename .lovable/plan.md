

## Redisenar vista de tareas estilo ClickUp

### Problema actual

Las cards de tareas son demasiado pequenas para gestionar subtareas comodamente. El formulario de subtareas, los controles de edicion y la informacion se comprimen dentro de una card limitada. La experiencia es muy distinta a lo que se espera de un gestor de tareas profesional como ClickUp.

### Solucion propuesta

Crear una **tercera vista tipo lista ClickUp** (ademas de la grid y la tabla existentes) que se convierta en la vista predeterminada. Esta vista muestra las tareas como filas expandibles agrupadas por estado, con columnas claras y subtareas anidadas directamente debajo de cada tarea.

---

### Diseno visual (inspirado en el screenshot de ClickUp)

```text
+-----------------------------------------------------------------------+
| v PENDIENTE  3  ...  +                                                |
|-----------------------------------------------------------------------|
|   Nombre              Persona asignada   Fecha limite   Prioridad   + |
|-----------------------------------------------------------------------|
|   v  Tarea ejemplo    [JR avatar]        15/02/26       Media       . |
|      |-- Subtarea 1   [MA]               16/02/26       Alta          |
|      |-- Subtarea 2   Sin asignar        --             Baja          |
|      + Agregar subtarea...                                            |
|-----------------------------------------------------------------------|
|   >  Otra tarea       [JR]               20/02/26       Urgente     . |
|-----------------------------------------------------------------------|
|   + Agregar Tarea                                                     |
+-----------------------------------------------------------------------+
| > EN CURSO  2                                                         |
+-----------------------------------------------------------------------+
| > COMPLETADAS  5                                                      |
+-----------------------------------------------------------------------+
```

### Cambios planificados

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/TaskListView.tsx` | **Nuevo**. Vista tipo lista ClickUp con tareas agrupadas por estado (Pendiente, En Curso, Completadas), filas expandibles con subtareas inline, y formulario de creacion rapida integrado en cada grupo. |
| `src/pages/tareas/TaskListRow.tsx` | **Nuevo**. Fila individual de tarea con columnas: nombre (expandible), persona asignada, fecha limite, prioridad, acciones. Al expandir muestra subtareas anidadas con el mismo patron de columnas. |
| `src/pages/tareas/TareasContent.tsx` | Agregar la tercera opcion de vista ("list-clickup") y hacerla predeterminada. Mantener grid y tabla como alternativas. |
| `src/pages/tareas/SubtasksPanel.tsx` | Adaptar para funcionar tanto dentro de cards como dentro de la vista de lista (recibir prop `variant="list"` para layout horizontal con columnas alineadas). |

---

### Detalle tecnico

#### 1. TaskListView - Vista agrupada por estado

- Agrupa las tareas en 3 secciones colapsables: **Pendiente**, **En Curso**, **Completadas**
- Cada seccion tiene un header con badge de color, contador y boton "+"
- Las secciones son `Collapsible` (se pueden colapsar/expandir)
- Header de columnas: Nombre | Persona asignada | Fecha limite | Prioridad | Acciones

#### 2. TaskListRow - Fila expandible

- Cada tarea ocupa una fila completa del ancho de pantalla (no una card pequena)
- Click en el chevron expande/colapsa las subtareas debajo
- Las subtareas se muestran con indentacion y el mismo patron de columnas
- Formulario "Agregar subtarea" inline al final de las subtareas expandidas
- Acciones en hover: editar, completar, eliminar (menu contextual)
- El titulo de la tarea es mas grande y legible (`text-sm font-medium`)

#### 3. Formulario de creacion inline

- Al hacer clic en "+ Agregar Tarea" dentro de un grupo de estado, aparece una fila inline con:
  - Input de titulo (ocupando la columna de nombre)
  - Selectores de asignacion, fecha y prioridad alineados con las columnas
  - Botones "Guardar" y "Cancelar"
- Mismo patron para subtareas dentro de una tarea expandida

#### 4. Integracion en TareasContent

- Agregar icono de vista lista (tipo `AlignJustify`) junto a los iconos existentes de Grid y Table
- Hacer esta vista la predeterminada (`useState<"grid" | "list" | "clickup">("clickup")`)
- Pasar los mismos handlers (onComplete, onEdit, onDelete, onJustify)

