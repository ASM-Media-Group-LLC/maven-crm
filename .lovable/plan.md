

## Diagnóstico

Las dos edge functions (`manage-user-roles` y `admin-user-actions`) siguen usando `authClient.auth.getClaims(token)` para verificar la identidad del usuario. Este método no funciona correctamente en este proyecto (falla con "Auth session missing" o "invalid_token").

Los auth logs confirman que las llamadas a `/user` (que es lo que usa `getUser()`) devuelven **status 200** exitosamente. Esto significa que `getUser(token)` sí funciona.

## Solución

Reemplazar `getClaims(token)` por `getUser(token)` en ambas edge functions. Es el método estándar y probado para verificar tokens en edge functions de Supabase.

### Cambio en ambas functions

```typescript
// ANTES (no funciona):
const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
const callerId = claimsData?.claims?.sub;

// DESPUÉS (estándar, funciona):
const { data: { user }, error: userError } = await authClient.auth.getUser(token);
const callerId = user?.id;
```

### Archivos a modificar

1. **`supabase/functions/manage-user-roles/index.ts`** -- Reemplazar `getClaims` por `getUser`
2. **`supabase/functions/admin-user-actions/index.ts`** -- Reemplazar `getClaims` por `getUser`

### Por qué va a funcionar esta vez

- Los auth logs muestran que `GET /user` (el endpoint que usa `getUser()`) devuelve **200** consistentemente
- `getUser(token)` valida el JWT contra el servidor de auth y devuelve el usuario directamente, sin depender de sesiones activas del lado del servidor
- Es el método documentado oficialmente por Supabase para edge functions

