
Objetivo: corregir de raíz los errores en quitar/asignar roles y restablecer contraseña en `/admin/usuarios`.

Diagnóstico
- El fallo ya no parece ser de permisos ni de sesión expirada del usuario.
- La causa común está en la validación JWT dentro de las edge functions:
  - `supabase/functions/admin-user-actions/index.ts`
  - `supabase/functions/manage-user-roles/index.ts`
- Los logs lo confirman:
  - `JWT verification failed: Unsupported "alg" value for a JSON Web Key Set`
- Eso significa que las functions están intentando verificar un token con un método incompatible:
  - hoy usan `createRemoteJWKSet(...) + jwtVerify(...)`
  - pero el token real que está llegando no coincide con ese esquema de verificación
- Como las 3 acciones dependen de estas functions:
  - asignar rol
  - quitar rol
  - restablecer password
  todas terminan devolviendo `401 invalid_token`.

Qué pasa exactamente
1. El frontend sí está autenticado y además los logs de Auth muestran refresh/login exitosos recientes.
2. La llamada llega a la function con `Authorization`.
3. La function falla antes de revisar si eres admin.
4. Por eso todo se cae como `Unauthorized`, aunque el problema real es la verificación del token.

Plan de corrección
1. Unificar la validación JWT en ambas edge functions
   - Extraer un helper de verificación compatible con ambos tipos de firma:
     - tokens asimétricos vía JWKS
     - tokens simétricos/legacy vía secret
   - Detectar el `alg` del header del JWT antes de verificar.
   - Si el token usa algoritmo tipo `HS256`, verificar con `SUPABASE_JWT_SECRET`.
   - Si usa algoritmo tipo `RS256`/`ES256`/similar, verificar con JWKS.
   - Mantener `verify_jwt = false` en `config.toml` y validar manualmente dentro de la function.

2. Aplicar el mismo helper en:
   - `supabase/functions/admin-user-actions/index.ts`
   - `supabase/functions/manage-user-roles/index.ts`
   Así evitamos que una function quede arreglada y la otra siga rompiéndose.

3. Mejorar logs de diagnóstico
   - Registrar de forma clara:
     - algoritmo detectado del token
     - si falló por header ausente
     - si falló por issuer
     - si falló por firma
     - si faltó `sub`
   - Sin exponer el token completo.

4. Endurecer `adminInvoke`
   - Mantener refresh de sesión, pero evitar que el frontend enmascare todos los fallos como “sesión expirada” si la function devuelve `invalid_token`.
   - Clasificar mejor:
     - 401 por sesión realmente caída
     - 401 por token inválido en function
     - 403 por falta de rol admin

5. Corregir inconsistencias del flujo de reset password
   - Revisar `ResetPasswordModal.tsx` porque hoy muestra “Se envió un email al usuario con la contraseña temporal”, pero la function realmente hace `updateUserById(password)` y devuelve la contraseña temporal; no se ve envío de email.
   - Ajustar el mensaje para que coincida con el comportamiento real y evitar confusión al operar desde admin.

6. Validación final
   - Probar estos casos:
     - asignar rol
     - quitar rol
     - restablecer contraseña
     - intentar quitarse el propio rol admin
     - usuario autenticado sin rol admin
   - Confirmar que después del fix los errores cambian de `401 invalid_token` a respuestas correctas según el caso.

Archivos a tocar
- `supabase/functions/admin-user-actions/index.ts`
- `supabase/functions/manage-user-roles/index.ts`
- `src/lib/adminInvoke.ts`
- `src/pages/admin/ResetPasswordModal.tsx`

Resultado esperado
- Las funciones admin dejarán de fallar en la fase de autenticación.
- Quitar rol, asignar rol y resetear contraseña volverán a funcionar desde `/admin/usuarios`.
- Los errores restantes, si existen, serán ya errores reales de permisos o negocio, no falsos `invalid_token`.

Detalle técnico
- El problema actual no es “no eres admin”.
- El problema es: la estrategia de verificación JWT implementada en edge functions no es compatible con el algoritmo del token que está llegando desde tu proyecto.
- Por eso hay que cambiar la verificación, no solo reintentar login.
