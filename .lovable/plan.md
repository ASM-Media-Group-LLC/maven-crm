

## Batch Actions para Proyectos

Agregar la capacidad de seleccionar múltiples proyectos y ejecutar acciones masivas sobre ellos.

### Funcionalidad

- **Checkboxes** en cada proyecto (grid y tabla) para seleccionar/deseleccionar
- **Barra de acciones flotante** que aparece al seleccionar 1+ proyectos, mostrando cantidad seleccionada y acciones disponibles
- **Acciones batch**: Archivar, Eliminar, Mover a carpeta
- **Seleccionar todo** en la barra de acciones

### Cambios

**`ProjectsListContent.tsx`**
- Nuevo state `selectedIds: Set<string>` para trackear selección
- Barra flotante fija abajo con: contador, botones de Archivar/Eliminar/Mover a carpeta, botón "Deseleccionar todo"
- En `renderProjectCard`: agregar checkbox en esquina superior izquierda del card, click en checkbox no navega
- Lógica batch: loop sobre `selectedIds` llamando las mutations existentes (`archiveProject`, `deleteProject`, `moveProjectToFolder`)
- Limpiar selección después de cada acción batch

**`ProjectsTable.tsx`**
- Nueva columna de checkbox a la izquierda
- Checkbox en header para seleccionar/deseleccionar todos los visibles
- Props nuevos: `selectedIds`, `onToggleSelect`, `onToggleAll`

### UX
- La barra batch aparece con animación slide-up cuando hay selección
- Los cards/rows seleccionados tienen borde/highlight visual (`ring-2 ring-primary`)
- Click en checkbox no dispara navegación al proyecto
- Confirmar antes de eliminar batch con un dialog

