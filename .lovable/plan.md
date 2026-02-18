

## Agregar funcionalidad "Crear Usuario" y buscador en tab Roles

### Resumen

Se agregaran dos funcionalidades: (1) un modal "Agregar Empleado" para crear usuarios desde el panel admin, y (2) un buscador en la pestana de Roles que actualmente no tiene. Ambos cambios siguen los patrones existentes de la plataforma.

---

### 1. Modal "Agregar Empleado" (AddUserModal)

Se creara `src/pages/admin/AddUserModal.tsx` con los campos mostrados en la imagen de referencia:

- **Correo Electronico** (requerido, icono de email)
- **Nombre** (requerido, icono de usuario)
- **Apellido** (requerido, icono de usuario)
- **Posicion** (select con roles existentes de `roles_config`)

El modal usara Dialog de Radix con botones "Cancelar" y "Agregar".

### 2. Edge Function: accion `create_user`

Se agregara una nueva accion `create_user` en `supabase/functions/admin-user-actions/index.ts` que:

1. Recibe `email`, `first_name`, `last_name`, y opcionalmente `role`
2. Usa `adminClient.auth.admin.createUser()` con `email_confirm: true` para crear el usuario sin necesidad de verificacion
3. El trigger `handle_new_user` existente crea automaticamente el perfil y asigna rol `employee`
4. Si se especifica un rol diferente, actualiza `user_roles` y el `full_name` en profiles con nombre + apellido

### 3. Buscador en tab Roles

Se modificara `RolesContent.tsx` para recibir una prop `search` y filtrar roles por nombre. El buscador se colocara en `AdminUsuarios.tsx` dentro del bloque del tab "roles", siguiendo el mismo patron del tab "usuarios" (buscador a la izquierda, toggle de vista a la derecha si aplica).

### 4. Cambios en AdminUsuarios.tsx

- Agregar estado `addUserOpen` para controlar el modal
- Agregar boton "Agregar Empleado" en el header (visible cuando tab es "usuarios")
- Mostrar buscador tambien cuando `activeTab === "roles"` (sin toggle de vista, solo el input de busqueda)
- El search se reutiliza para ambos tabs, reseteandolo al cambiar de tab

---

### Seccion tecnica

**Archivos a crear:**
- `src/pages/admin/AddUserModal.tsx` - Modal con formulario (email, nombre, apellido, posicion/rol)

**Archivos a modificar:**
- `supabase/functions/admin-user-actions/index.ts` - Agregar accion `create_user` usando `auth.admin.createUser`
- `src/pages/admin/AdminUsuarios.tsx` - Agregar boton "Agregar Empleado" en header, estado del modal, buscador en tab roles
- `src/pages/admin/RolesContent.tsx` - Aceptar prop `search` y filtrar roles por nombre

**Logica de creacion de usuario:**
```
action: "create_user"
params: { email, first_name, last_name, role? }

1. auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name } })
2. El trigger handle_new_user inserta perfil + rol employee automaticamente
3. Si role !== "employee", actualizar user_roles con el rol especificado
```

**Validacion del formulario:**
- Email: requerido, formato valido
- Nombre: requerido, max 50 chars
- Apellido: requerido, max 50 chars
- Posicion: opcional (default employee)

