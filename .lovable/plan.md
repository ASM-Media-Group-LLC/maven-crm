

## Plan: Crear página /credentials con acceso rápido por rol

### Concepto
Página pública (sin autenticación) en `/credentials` que muestra tarjetas para cada rol del sistema (admin, manager, employee, agent, closer, supervisor). Cada tarjeta tiene un botón "Acceder" que hace `signInWithPassword` automáticamente con credenciales de cuentas de prueba predefinidas.

### Requisito previo: cuentas de prueba en Supabase
Se necesitan 6 usuarios de prueba en Supabase Auth, cada uno con un rol asignado en `user_roles`. Las credenciales se hardcodean en el frontend (son cuentas de prueba, no producción).

### Implementación

**1. Crear `src/pages/Credentials.tsx`**
- Array de configuración con cada rol: nombre, descripción, email, password, icono, color
- Al hacer clic en "Acceder": ejecuta `supabase.auth.signInWithPassword({ email, password })` y navega a `/dashboard`
- UI: grid de cards con el estilo del proyecto (fondo oscuro, glassmorphism similar a AuthLayout)
- Mostrar loader durante el login, toast de error si falla
- Si ya hay sesión activa, mostrar opción de cerrar sesión primero

**2. Agregar ruta en `App.tsx`**
- Ruta pública: `<Route path="/credentials" element={<Credentials />} />`

**3. Cuentas de prueba necesarias**
Se crearán 6 usuarios en Supabase Auth con emails tipo `test-admin@maven.app`, `test-manager@maven.app`, etc., y se asignarán los roles correspondientes en `user_roles`. Esto se puede hacer via SQL insert o desde el dashboard de Supabase.

### Seguridad
- Esta página es solo para desarrollo/testing
- Las credenciales son de cuentas de prueba sin datos sensibles
- Se puede agregar una variable de entorno para ocultarla en producción si se desea

### Archivos
- **Crear**: `src/pages/Credentials.tsx`
- **Modificar**: `src/App.tsx` (agregar ruta)
- **Supabase**: crear 6 usuarios de prueba y asignar roles

