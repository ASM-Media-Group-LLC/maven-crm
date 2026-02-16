

## Mejoras en subtareas, tamano de cards y drag-and-drop de proyectos

### Problemas detectados

1. **Select de prioridad**: No muestra "Prioridad" como placeholder; muestra el valor seleccionado ("Media") desde el inicio porque tiene `value="medium"` por defecto.
2. **Select de asignacion**: No tiene buscador integrado. Solo es un Select simple sin filtro de texto.
3. **Cards de tareas pequenas**: El padding `p-4` y el espacio reducido hacen incomodo escribir subtareas dentro de la card.
4. **Drag-and-drop de proyectos no funciona**: Aunque `DraggableGrid` esta conectado, el `onClick` del Card (`navigate(/tareas/...)`) se dispara al soltar el drag, lo que navega fuera en lugar de reordenar.

---

### Cambios planificados

| Archivo | Cambio |
|---------|--------|
| `SubtasksPanel.tsx` | Cambiar select de prioridad para mostrar placeholder "Prioridad". Reemplazar select de asignacion por Popover+Command con buscador (patron de CreateProjectModal). |
| `SubtaskItem.tsx` | Aplicar los mismos cambios en el modo de edicion: placeholder "Prioridad" y buscador en asignacion. |
| `TaskCard.tsx` | Aumentar padding de `p-4` a `p-5` y mejorar espaciado interno para mas comodidad al trabajar con subtareas. |
| `ProjectsListContent.tsx` | Corregir conflicto drag vs click: prevenir la navegacion cuando se esta arrastrando un proyecto. |
| `DraggableGrid.tsx` | Exponer estado de arrastre para que los hijos puedan saber si hubo drag activo y evitar clicks accidentales. |

---

### Detalle tecnico

#### 1. Select de prioridad con placeholder

Cambiar de `value={newPriority}` (siempre tiene valor) a usar un valor vacio como estado inicial y mostrar placeholder "Prioridad":
- Estado inicial: `""` en lugar de `"medium"`
- Al agregar, si no se selecciono prioridad, usar `"medium"` como default
- Placeholder visible: "Prioridad"

#### 2. Select de asignacion con buscador

Reemplazar el `<Select>` simple por el patron `Popover + Command` que ya se usa en `CreateProjectModal`:
- `CommandInput` con placeholder "Buscar usuario..."
- Lista filtrable de perfiles
- Placeholder del trigger: "Asignar"
- Seleccion unica (no multi-select como en miembros)

#### 3. Cards de tareas mas grandes

- Aumentar padding de CardContent de `p-4` a `p-5`
- Aumentar gap interno de `gap-3` a `gap-4`
- Dar mas espacio al area de subtareas expandida

#### 4. Corregir drag-and-drop de proyectos

El problema: al arrastrar y soltar una card de proyecto, el evento `onClick` del Card se dispara y navega a `/tareas/{id}`. La solucion:
- En `DraggableGrid`, rastrear si ocurrio un drag real (no solo un click)
- Usar un ref `wasDragged` que se activa en `onDragStart` y se consulta en un `onClickCapture` en el wrapper para cancelar el click si hubo arrastre
- Esto permite que el click normal siga funcionando pero previene la navegacion accidental al soltar un drag
