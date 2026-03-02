

## Plan: Verificación por Código OTP en lugar de Link

### Problema actual
Cuando un usuario se registra, Supabase envía un email con un **link** que redirige a un dominio de Lovable (`lovable.app`). El usuario ve branding de Lovable y la experiencia se siente ajena a Maven.

### Solución
Cambiar el flujo de verificación de email para usar **código OTP de 6 dígitos** que el usuario introduce directamente en la app, sin salir nunca de Maven.

### Cambios necesarios

**1. Configurar Supabase para OTP por email**
- Ejecutar migración SQL para habilitar OTP en la configuración de auth (esto se configura desde el dashboard de Supabase en Auth > Email Templates, cambiando el template para incluir `{{ .Token }}` en lugar del link).
- Nota: Supabase soporta nativamente el tipo `signup` con `verifyOtp` usando el token que envía por email.

**2. Modificar `Register.tsx`**
- Después de un registro exitoso, en vez de navegar a `/login`, mostrar una pantalla de verificación OTP inline (o navegar a `/verify-email`).
- Guardar el email en estado para pasarlo a la verificación.

**3. Crear página `/verify-email` (nueva)**
- Input OTP de 6 dígitos usando el componente `InputOTP` que ya existe en el proyecto.
- Al completar el código, llamar a `supabase.auth.verifyOtp({ email, token, type: 'signup' })`.
- Si es exitoso, redirigir a `/dashboard`.
- Botón "Reenviar código" que llama a `supabase.auth.resend({ type: 'signup', email })`.
- Usar `AuthLayout` para mantener el mismo diseño visual de Maven.

**4. Actualizar `App.tsx`**
- Agregar ruta pública `/verify-email` apuntando al nuevo componente.

**5. Configurar email templates en Supabase**
- El template de confirmación de signup debe mostrar el código OTP (`{{ .Token }}`) en lugar del link de confirmación, para que el email solo muestre un código de 6 dígitos sin enlaces a Lovable.

### Flujo resultante

```text
Registro → Pantalla OTP (en Maven) → Usuario recibe email con código
→ Introduce código → Verificado → Dashboard
```

### Archivos involucrados
- `src/pages/Register.tsx` — cambiar navegación post-registro
- `src/pages/VerifyEmail.tsx` — **nuevo** — pantalla OTP
- `src/App.tsx` — agregar ruta `/verify-email`
- Supabase Auth config — cambiar template de email para usar token OTP

