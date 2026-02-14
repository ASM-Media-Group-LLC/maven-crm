

## Fix: Recuperacion de contrasena - Deteccion robusta de sesion de recovery

### Problema identificado

Hay una condicion de carrera en `ResetPassword.tsx`:

1. Supabase redirige a `/reset-password#access_token=...&type=recovery`
2. La app carga. `AuthProvider` registra su `onAuthStateChange` primero
3. El cliente Supabase procesa los fragmentos del hash de forma asincrona
4. `ResetPassword` monta y registra su propio `onAuthStateChange`, pero el evento `PASSWORD_RECOVERY` ya fue disparado
5. `getSession()` podria ejecutarse antes de que el hash sea procesado, retornando `null`
6. Resultado: el usuario ve "El enlace es invalido o ha expirado" aunque el enlace sea valido

### Solucion

Modificar `ResetPassword.tsx` para:

1. **Detectar hash fragments en la URL**: Si la URL contiene `type=recovery` en el hash, esperar a que el evento se procese antes de mostrar error
2. **Agregar timeout de seguridad**: Si despues de 5 segundos no se detecta sesion ni evento, mostrar el error
3. **Reintentar `getSession()` despues del evento**: Usar un intervalo corto para re-verificar la sesion si hay hash fragments presentes

### Archivo a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/ResetPassword.tsx` | Reescribir logica de deteccion de sesion de recovery |

### Detalle tecnico del cambio en ResetPassword.tsx

Reemplazar el `useEffect` actual por una logica mas robusta:

```text
useEffect:
  1. Registrar onAuthStateChange para PASSWORD_RECOVERY
  2. Detectar si hay hash fragments con type=recovery en la URL
  3. Si hay hash fragments:
     - Esperar a que onAuthStateChange dispare PASSWORD_RECOVERY
     - Fallback: reintentar getSession() cada 500ms hasta 5 segundos
  4. Si NO hay hash fragments:
     - Verificar getSession() una vez
     - Si hay sesion, mostrar formulario
     - Si no, mostrar error inmediatamente
  5. Timeout maximo de 5 segundos para evitar loading infinito
```

La deteccion de hash fragments se hace con:
```text
const hashParams = new URLSearchParams(window.location.hash.substring(1));
const isRecoveryRedirect = hashParams.get("type") === "recovery";
```

Si `isRecoveryRedirect` es true, el componente espera pacientemente a que el cliente Supabase procese los tokens antes de decidir si el enlace es valido o no.

### Comportamiento esperado despues del fix

1. Usuario solicita recovery en `/forgot-password` → email enviado
2. Usuario hace clic en el enlace del email → redirigido a `/reset-password#access_token=...&type=recovery`
3. Pagina muestra spinner de carga mientras procesa los tokens
4. Una vez procesado, muestra el formulario de nueva contrasena
5. Usuario establece nueva contrasena → toast de exito → redirigido a `/login`

