
## Agregar acciones de Editar y Eliminar en Asistencia, Ausencias, Vacaciones y Permisos

### Situacion actual

| Pagina | Acciones disponibles | Falta |
|---|---|---|
| HRAttendance | Ninguna (no hay columna de acciones) | Editar + Eliminar |
| HRAbsences | Ver (Eye) + Aprobar/Rechazar | Editar + Eliminar |
| HRVacations | Ver (Eye) + Aprobar/Rechazar | Editar + Eliminar |
| HRPermisos | Ver (Eye) + Aprobar/Rechazar | Editar + Eliminar |

Las cuatro paginas usan la tabla `absences` (ausencias, vacaciones, permisos) o `attendance` (asistencia), y ya tienen mutaciones para actualizar el status pero no para editar campos ni eliminar registros.

### Cambios por archivo

#### 1. `src/pages/hr/HRAttendance.tsx`
- Agregar columna **Acciones** (sticky right) en la tabla
- **Editar**: Boton `Pencil` que abre un modal `EditAttendanceModal` con campos: empleado (readonly), fecha, turno, horario, check-in, check-out, estado, notas
- **Eliminar**: Boton `Trash2` que abre un `AlertDialog` de confirmacion y ejecuta `supabase.from("attendance").delete().eq("id", id)`
- Agregar la mutacion `deleteMutation` y `editMutation` con `useQueryClient().invalidateQueries`

#### 2. `src/pages/hr/HRAbsences.tsx`
- Agregar boton `Pencil` junto al `Eye` en la tabla y en la grid
- **Editar**: Modal `EditAbsenceModal` con campos: empleado (readonly), tipo de ausencia, fecha inicio, fecha fin, motivo, notas
- **Eliminar**: Boton `Trash2` con `AlertDialog` de confirmacion, ejecuta `supabase.from("absences").delete().eq("id", id)`
- Agregar mutaciones `deleteMutation` y `editMutation`

#### 3. `src/pages/hr/HRVacations.tsx`
- Agregar botones `Pencil` y `Trash2` en la funcion `renderActions` junto al `Eye` existente
- **Editar**: Modal `EditVacationModal` con campos: empleado (readonly), tipo, fecha inicio, fecha fin, dias totales, motivo
- **Eliminar**: `AlertDialog` de confirmacion con delete en `absences`
- Agregar mutaciones correspondientes

#### 4. `src/pages/hr/HRPermisos.tsx`
- Agregar botones `Pencil` y `Trash2` en tabla y grid junto al `Eye` existente
- **Editar**: Modal `EditPermisoModal` con campos: empleado (readonly), tipo de permiso, fecha, horario (notes), motivo
- **Eliminar**: `AlertDialog` de confirmacion con delete en `absences`
- Agregar mutaciones correspondientes

### Detalle tecnico

Cada archivo recibira tres adiciones internas (sin crear archivos nuevos):

1. **Mutacion de edicion**: `useMutation` que hace `supabase.from("tabla").update(data).eq("id", id)` e invalida la query correspondiente
2. **Mutacion de eliminacion**: `useMutation` que hace `supabase.from("tabla").delete().eq("id", id)` e invalida la query
3. **Modal de edicion**: Componente inline con `Dialog` que muestra un formulario con los campos editables. El empleado se muestra como texto readonly (no editable)
4. **Dialog de eliminacion**: `AlertDialog` con mensaje "Esta accion no se puede deshacer" y botones Cancelar / Eliminar (destructive)
5. **Botones en tabla/grid**: `Pencil` (editar) y `Trash2` (eliminar) como `Button variant="ghost" size="sm" className="h-7 w-7 p-0"`

Patron de acciones en cada fila:

```text
[ Eye (ver) ] [ Pencil (editar) ] [ Check/X (aprobar/rechazar, solo si pending) ] [ Trash2 (eliminar) ]
```

Para Asistencia (sin aprobar/rechazar):

```text
[ Pencil (editar) ] [ Trash2 (eliminar) ]
```

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRAttendance.tsx` | Agregar columna Acciones con Pencil + Trash2, modal de edicion, dialog de eliminacion, mutaciones |
| `src/pages/hr/HRAbsences.tsx` | Agregar Pencil + Trash2 en tabla y grid, modal de edicion, dialog de eliminacion, mutaciones |
| `src/pages/hr/HRVacations.tsx` | Agregar Pencil + Trash2 en renderActions, modal de edicion, dialog de eliminacion, mutaciones |
| `src/pages/hr/HRPermisos.tsx` | Agregar Pencil + Trash2 en tabla y grid, modal de edicion, dialog de eliminacion, mutaciones |
