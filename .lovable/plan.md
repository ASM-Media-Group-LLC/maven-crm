

## Plan: Estabilizar flujos de contraseña (admin reset + user self-service reset)

### Problemas identificados

1. **Admin reset password (desde `/admin/usuarios`)**: Funciona correctamente a nivel de código -- usa `adminInvoke` que ya maneja sesión expirada. El error 401 que ves es el mismo problema de sesión que ya abordamos en el plan anterior; con el fix de `adminInvoke` ya debería funcionar si estás logueado.

2. **ForgotPassword (`/forgot-password`)**: Usa `window.location.origin` para el `redirectTo`, lo cual en el preview de Lovable genera un URL del preview que puede no coincidir con producción. Debería usar `VITE_PUBLIC_URL` (ya existe `getPublicBaseUrl()` en el proyecto).

3. **ResetPassword (`/reset-password`)**: Tiene una lógica de detección de recovery frágil -- usa polling con `getSession()` cada 500ms durante 5 segundos. Si el hash de Supabase no se procesa a tiempo, muestra "enlace inválido" erróneamente. Además, la detección de `#type=recovery` en el hash puede fallar dependiendo del formato exacto del redirect de Supabase.

4. **ChangePasswordModal (dashboard)**: Usa validación mínima de 6 caracteres, inconsistente con ResetPassword que pide 8 + mayúscula + número.

5. **`adminInvoke` ya centraliza errores**: El reset desde admin ya usa `adminInvoke`, así que la parte de sesión expirada ya está cubierta.

### Cambios a implementar

**1. ForgotPassword.tsx -- Usar URL pública correcta**
- Cambiar `window.location.origin` por `getPublicBaseUrl()` para que el link de recovery apunte al dominio correcto en producción.

**2. ResetPassword.tsx -- Robustecer detección de recovery**
- Simplificar la lógica: además de escuchar `PASSWORD_RECOVERY`, también parsear los query params que Supabase pone en el hash (`access_token`, `refresh_token`, `type=recovery`).
- Si hay tokens en el hash, llamar `supabase.auth.setSession()` directamente en vez de esperar polling.
- Aumentar el timeout de seguridad a 8 segundos.
- Manejar el caso donde el usuario ya tiene sesión activa (ej. llegó por bookmark) sin confundirlo con recovery.

**3. ChangePasswordModal.tsx -- Alinear validación de contraseña**
- Aplicar las mismas reglas que ResetPassword: mínimo 8 caracteres, 1 mayúscula, 1 número.
- Agregar indicadores visuales de requisitos (como en ResetPassword).

**4. Edge function `admin-user-actions` (reset_password action) -- Sin cambios necesarios**
- La acción `reset_password` ya funciona correctamente: genera contraseña temporal y usa `adminClient.auth.admin.updateUserById`. El problema era solo la autenticación del caller, ya resuelta.

### Archivos a modificar
- `src/pages/ForgotPassword.tsx` (1 línea: import + uso de `getPublicBaseUrl`)
- `src/pages/ResetPassword.tsx` (reescribir useEffect de detección de recovery)
- `src/components/dashboard/ChangePasswordModal.tsx` (alinear validación, agregar indicadores)

### Resultado esperado
- Admin puede resetear contraseñas desde `/admin/usuarios` sin 401 (ya cubierto por `adminInvoke`).
- Usuarios pueden hacer forgot password y el link funciona tanto en preview como en producción.
- La página `/reset-password` detecta el token de recovery de forma robusta sin falsos "enlace inválido".
- Cambiar contraseña desde el dashboard tiene las mismas reglas de seguridad que el reset.

