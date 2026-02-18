

## Cambios en Gestion de Usuarios

### 1. Nuevo flujo de "Restablecer Contrasena" (modal de 2 pasos)

Actualmente, al hacer clic en "Reset contrasena" se envia un email directamente sin confirmacion. Se reemplazara por un modal con dos estados:

**Paso 1 - Confirmacion:** Dialogo con icono de llave, titulo "Restablecer Contrasena", mensaje "Estas seguro de restablecer la contrasena de [Nombre]?", y dos botones: "Cancelar" y "Restablecer Contrasena" (boton primario naranja/amber).

**Paso 2 - Resultado:** Al confirmar, el backend genera una contrasena temporal aleatoria, la establece como nueva contrasena del usuario, y la retorna. El modal muestra:
- Titulo "Restablecer Contrasena" con icono de llave
- Mensaje de exito: "La contrasena ha sido restablecida exitosamente."
- Alerta verde: "Se envio un email al usuario con la contrasena temporal."
- Campo de solo lectura con la contrasena temporal y boton de copiar al portapapeles
- Texto de ayuda: "El usuario debera cambiar esta contrasena al iniciar sesion."
- Boton "Cerrar"

**Nuevo componente:** `src/pages/admin/ResetPasswordModal.tsx`

### 2. Actualizacion de la Edge Function

La edge function `admin-user-actions` se modificara para que la accion `reset_password`:
- Genere una contrasena temporal aleatoria (8 caracteres, alfanumerica con simbolos)
- Use `adminClient.auth.admin.updateUserById(user_id, { password: tempPassword })` para establecerla
- Retorne `{ success: true, temp_password: "..." }` en la respuesta

### 3. Boton principal: "Agregar Usuario" en lugar de "Agregar Empleado"

En `AdminUsuarios.tsx` (linea 103) cambiar el texto de "Agregar Empleado" a "Agregar Usuario". Tambien en el titulo del modal `AddUserModal.tsx` (linea 57) cambiar "Agregar Empleado" a "Agregar Usuario".

### 4. EditUserModal ampliado

El modal de edicion actual solo permite cambiar el nombre completo. Se ampliara para incluir todos los campos del formulario de agregar usuario:
- Nombre (first_name)
- Apellido (last_name)
- Rol (select con roles de roles_config)

El email no sera editable (se mostrara como campo deshabilitado o no se incluira, ya que no esta disponible desde el cliente).

La edge function `admin-user-actions` tambien se actualizara para que `update_profile` acepte `first_name`, `last_name` y `role` (actualizando tanto profiles como user_roles).

---

### Seccion tecnica

**Archivos a crear:**
- `src/pages/admin/ResetPasswordModal.tsx` - Modal de 2 pasos (confirmacion + resultado con contrasena temporal y boton copiar)

**Archivos a modificar:**
- `supabase/functions/admin-user-actions/index.ts`
  - Accion `reset_password`: generar contrasena temporal, aplicarla con `updateUserById`, retornar `temp_password`
  - Accion `update_profile`: aceptar `first_name`, `last_name`, `role` ademas de `full_name`
- `src/pages/admin/AdminUsuarios.tsx`
  - Linea 103: "Agregar Empleado" a "Agregar Usuario"
  - Reemplazar `handleResetPassword` para abrir el nuevo `ResetPasswordModal` en lugar de ejecutar directamente
  - Integrar `ResetPasswordModal`
- `src/pages/admin/AddUserModal.tsx`
  - Linea 57: "Agregar Empleado" a "Agregar Usuario"
- `src/pages/admin/EditUserModal.tsx`
  - Ampliar interfaz para recibir el usuario completo (AdminUser)
  - Agregar campos: nombre, apellido, rol (con Select de roles_config)
  - Actualizar `onConfirm` para enviar todos los campos editables

**Logica de contrasena temporal en la Edge Function:**

```text
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
```

