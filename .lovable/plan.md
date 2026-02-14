

## Flujo completo de recuperacion de contrasena

### Enfoque tecnico

Supabase Auth incluye soporte nativo para recuperacion de contrasena mediante `resetPasswordForEmail()` y `updateUser()`. No se necesita crear tablas de tokens ni edge functions. Supabase gestiona internamente la generacion del token, la expiracion (1 hora por defecto) y el uso unico.

El flujo es:
1. Usuario solicita reset en `/forgot-password`
2. Supabase envia email con enlace que redirige a `/reset-password`
3. Al hacer clic en el enlace, Supabase establece una sesion temporal con evento `PASSWORD_RECOVERY`
4. La pagina `/reset-password` detecta ese evento y permite al usuario establecer nueva contrasena via `updateUser({ password })`

### Archivos a crear

| Archivo | Proposito |
|---------|-----------|
| `src/pages/ForgotPassword.tsx` | Formulario de solicitud de recuperacion |
| `src/pages/ResetPassword.tsx` | Formulario para establecer nueva contrasena |

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/App.tsx` | Agregar rutas publicas `/forgot-password` y `/reset-password` |
| `src/pages/Login.tsx` | Agregar enlace "Olvidaste tu contrasena?" debajo del formulario |

### Detalle de cada pagina

**`/forgot-password` - Solicitar recuperacion**

- Mismo diseno visual que Login: fondo `bg-background`, card centrada con `border-border bg-card`, Logo arriba
- Campo: Email con validacion de formato
- Boton: "Enviar enlace de recuperacion" (variante `default`, `w-full`)
- Al enviar: llama `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`
- Mensaje neutro siempre (no revela si el email existe): "Si el correo esta registrado, recibiras un enlace para restablecer tu contrasena."
- Enlace para volver a Login
- Toggle de visibilidad no aplica (solo campo email)
- Estado de loading con `Loader2` en el boton

**`/reset-password` - Establecer nueva contrasena**

- Mismo diseno visual que Login
- Al montar, escucha `supabase.auth.onAuthStateChange` para detectar evento `PASSWORD_RECOVERY`
- Si no hay sesion de recovery: muestra mensaje de error con opcion de solicitar nuevo enlace (link a `/forgot-password`)
- Si hay sesion valida: muestra formulario con:
  - Campo: Nueva contrasena (con toggle Eye/EyeOff)
  - Campo: Confirmar contrasena (con toggle Eye/EyeOff)
  - Validaciones client-side:
    - Minimo 8 caracteres
    - Al menos 1 mayuscula
    - Al menos 1 numero
    - Ambas contrasenas coinciden
  - Indicador visual de requisitos (texto `text-xs` con color condicional `text-green-500`/`text-muted-foreground`)
  - Boton: "Actualizar contrasena" (variante `default`, `w-full`)
- Al confirmar: llama `supabase.auth.updateUser({ password })`
- Exito: toast "Contrasena actualizada" + redirect a `/login`
- Error: toast destructivo con mensaje de error

**Modificacion en Login.tsx**

Agregar debajo del enlace "Registrate":
```text
Olvidaste tu contrasena? -> Link a /forgot-password
```

**Modificacion en App.tsx**

Agregar dos rutas publicas (junto a `/login` y `/register`):
```text
<Route path="/forgot-password" element={<ForgotPassword />} />
<Route path="/reset-password" element={<ResetPassword />} />
```

### Seguridad

- El token es gestionado por Supabase (generacion, expiracion de 1 hora, uso unico)
- No se almacena informacion sensible en el frontend
- Mensaje neutro en forgot-password para no revelar existencia de cuentas
- Validaciones de fortaleza de contrasena en el cliente
- `updateUser` solo funciona con sesion de recovery activa (Supabase lo valida server-side)

### Sin cambios en base de datos

No se requieren migraciones ni tablas adicionales. Supabase maneja todo el flujo de tokens internamente.

