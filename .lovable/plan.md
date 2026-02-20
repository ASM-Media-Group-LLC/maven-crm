

## Completar Editar y Eliminar en HRPermisos

### Contexto

El archivo `src/pages/hr/HRPermisos.tsx` ya tiene los imports necesarios (`Pencil`, `Trash2`, `AlertDialog` components) pero le falta la logica, modales y botones de editar/eliminar.

### Cambios en `src/pages/hr/HRPermisos.tsx`

#### 1. Agregar estados (despues de linea 325)

Nuevos estados `editData` y `deleteId` para controlar los modales de edicion y eliminacion.

#### 2. Agregar mutaciones (despues de `updateStatus`, linea 345)

- **editMutation**: `supabase.from("absences").update({ absence_type, start_date, end_date, notes, reason }).eq("id", id)` con invalidacion de query `["permisos"]`
- **deleteMutation**: `supabase.from("absences").delete().eq("id", id)` con invalidacion de query `["permisos"]`

#### 3. Agregar botones en la tabla (lineas 566-583)

Insertar botones `Pencil` y `Trash2` en la celda de acciones, junto al `Eye` y los botones de aprobar/rechazar existentes:

```text
[ Eye ] [ Pencil ] [ Check/X si pending ] [ Trash2 ]
```

#### 4. Agregar botones en la grid (lineas 639-652)

Insertar botones `Pencil` y `Trash2` en la seccion de acciones de cada card, mismo patron.

#### 5. Agregar EditPermisoModal (componente inline)

Modal con `Dialog` que permite editar:
- Tipo de permiso (Select con PERMISSION_TYPES)
- Fecha (DatePicker)
- Horario (Input, campo `notes`)
- Motivo (Textarea, campo `reason`)

El empleado se muestra como texto readonly.

#### 6. Agregar AlertDialog de eliminacion

Dialog de confirmacion con mensaje "Esta accion no se puede deshacer" y botones Cancelar / Eliminar (destructive). Se renderiza al final junto con los otros modales.

### Archivo a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRPermisos.tsx` | Agregar estados, mutaciones, botones Pencil+Trash2 en tabla y grid, modal de edicion, dialog de eliminacion |

