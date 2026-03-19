

## Diagnóstico definitivo

Los logs del edge function confirman el problema real:

```
JWT claims verification failed: Auth session missing!
```

`authClient.auth.getClaims(token)` internamente hace una llamada al servidor de Auth que verifica la **sesión**, no solo el JWT. Cuando la sesión expira o se invalida en el servidor (como pasa en el preview de Lovable), `getClaims()` falla aunque el token JWT siga siendo criptográficamente válido.

Esto explica por qué todo falla: no es un problema de permisos ni de rol admin, es que la verificación de identidad depende de una sesión que ya no existe en el servidor.

## Solución

Reemplazar `getClaims()` por verificación directa del JWT usando el secret `SUPABASE_JWT_SECRET` (disponible automáticamente en edge functions). Esto verifica la firma criptográfica del token sin depender de la sesión del servidor.

### Cambios

**1. Ambas edge functions: verificar JWT con jose (sin depender de sesión)**

En `admin-user-actions/index.ts` y `manage-user-roles/index.ts`:

- Importar `jwtVerify` de `https://deno.land/x/jose@v5.2.0/index.ts`
- Reemplazar el bloque `getClaims()` por verificación directa:
  ```typescript
  const secret = new TextEncoder().encode(Deno.env.get("SUPABASE_JWT_SECRET")!);
  const { payload } = await jwtVerify(token, secret, { issuer: `${Deno.env.get("SUPABASE_URL")!}/auth/v1` });
  const callerId = payload.sub;
  ```
- Eliminar la creación del `authClient` (ya no se necesita)
- Mantener el `adminClient` para operaciones privilegiadas

**2. Frontend `adminInvoke.ts`: refrescar sesión antes de llamar**

- Antes de invocar, llamar `supabase.auth.refreshSession()` en lugar de solo `getSession()` para obtener un token fresco si el actual ya está cerca de expirar
- Esto reduce la probabilidad de enviar tokens asociados a sesiones muertas

### Archivos a modificar

- `supabase/functions/admin-user-actions/index.ts` (verificación JWT)
- `supabase/functions/manage-user-roles/index.ts` (verificación JWT)
- `src/lib/adminInvoke.ts` (refresh de sesión)

### Resultado

- La verificación ya no depende de sesiones del servidor
- Si el JWT es válido y no ha expirado, la operación procede
- Se elimina la causa raíz del error "Auth session missing!"

