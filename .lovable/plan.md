

## Cambios: Renombrar "Posicion" a "Rol" y agregar boton "Nuevo Rol"

### 1. AddUserModal.tsx - Renombrar "Posicion" a "Rol"

Cambiar la etiqueta del campo `Label` de "Posicion" a "Rol" (linea con `htmlFor="role"`). El placeholder del Select tambien se actualizara a "Seleccionar rol".

### 2. AdminUsuarios.tsx - Agregar boton "Nuevo Rol" en el header

Cuando el tab activo sea "roles", mostrar un boton "Nuevo Rol" en el header (misma posicion que "Agregar Empleado" para usuarios). Este boton necesita comunicarse con `RolesContent` para abrir el `CreateRoleModal`.

Para esto se elevara el estado `createRoleOpen` a `AdminUsuarios.tsx` y se pasara como prop a `RolesContent`.

### 3. RolesContent.tsx - Recibir prop para controlar modal de creacion

Se agregaran props `createOpen` y `onCreateOpenChange` para que el modal de creacion sea controlado desde el padre (`AdminUsuarios`).

### Seccion tecnica

**Archivos a modificar:**

- `src/pages/admin/AddUserModal.tsx` - Cambiar label "Posicion" por "Rol" (linea 101)
- `src/pages/admin/AdminUsuarios.tsx` - Agregar estado `createRoleOpen`, mostrar boton "Nuevo Rol" cuando `activeTab === "roles"`, pasar props a `RolesContent`
- `src/pages/admin/RolesContent.tsx` - Aceptar props `createOpen` y `onCreateOpenChange` en lugar de estado local para el modal de creacion

