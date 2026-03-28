

## Plan: Corregir enlace duplicado en Recuperar Contraseña

### Problema
En la pantalla de "Recuperar contraseña", cuando se envía el correo, se muestran dos enlaces "Volver a iniciar sesión" y el subtítulo "Ingresa tu email..." sigue visible aunque ya se envió.

### Corrección en `src/pages/ForgotPassword.tsx`

1. **Ocultar subtítulo cuando `sent=true`** — mover el texto descriptivo dentro del bloque `!sent`
2. **Eliminar el bloque duplicado de "Volver a iniciar sesión"** (líneas 73-80) — ya existe un enlace dentro del bloque `sent`, y otro idéntico en el bloque inferior `!sent`. Solo se necesita el que está dentro de cada rama del condicional.

La estructura quedará:
```
Header: "Recuperar contraseña" (siempre visible)
  → Si sent: mensaje de confirmación + 1 enlace "Volver"
  → Si !sent: subtítulo + formulario + 1 enlace "Volver"
```

### Archivo
- **Modificar**: `src/pages/ForgotPassword.tsx`

