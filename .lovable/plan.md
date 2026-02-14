

## Mejoras en Login/Registro y asignacion de rol Admin

### 1. Toggle de visibilidad de contrasena

Agregar un boton con icono `Eye`/`EyeOff` dentro de los campos de contrasena en ambas paginas para alternar entre `type="password"` y `type="text"`.

**Archivos a modificar:**

- `src/pages/Login.tsx`: Agregar estado `showPassword` y boton toggle en el campo de contrasena
- `src/pages/Register.tsx`: Agregar estados `showPassword` y `showConfirmPassword` con toggles en ambos campos

Patron visual: el icono se posiciona con `absolute right-3 top-1/2 -translate-y-1/2` dentro de un contenedor `relative`. Se usa `Button variant="ghost" size="icon"` con iconos `Eye`/`EyeOff` de Lucide.

### 2. Mensaje de verificacion por correo en registro

Despues de un registro exitoso, en lugar de redirigir directamente al dashboard, mostrar un toast informativo indicando que se envio un correo de verificacion.

**Cambio en `src/pages/Register.tsx`:**
- Reemplazar el toast actual y `navigate("/dashboard")` por un toast con titulo "Cuenta creada" y descripcion "Te enviamos un correo de verificacion. Revisa tu bandeja de entrada y haz clic en el enlace para activar tu cuenta."
- Redirigir a `/login` en lugar de `/dashboard` para que el usuario inicie sesion despues de verificar

### 3. Asignar rol admin a johanna.riano@unlok.me

El usuario ya existe con `id: 2d2c4570-0cf6-4144-89bb-67d5bd96179c` y tiene rol `employee`. Se actualizara su rol a `admin` mediante una operacion de datos.

**Operacion:** Actualizar el registro en `user_roles` donde `user_id = '2d2c4570-0cf6-4144-89bb-67d5bd96179c'` cambiando `role` de `employee` a `admin`.

### Resumen de archivos

| Archivo | Cambio |
|---------|--------|
| `src/pages/Login.tsx` | Agregar toggle de visibilidad en campo contrasena |
| `src/pages/Register.tsx` | Agregar toggles de visibilidad en campos contrasena + mensaje de verificacion por correo |
| Base de datos | Actualizar rol de johanna.riano@unlok.me a admin |

