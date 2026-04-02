

## Fix `created_by` en tabla `creators`

### Diagnóstico

**Datos actuales**: Los 20 registros más recientes en `creators` tienen `created_by = NULL`. El campo nunca se está poblando.

**Puntos de inserción encontrados** (3 archivos):

| Archivo | ¿Pasa `created_by`? |
|---|---|
| `ClosersContent.tsx` (línea 64) | ✅ Sí: `created_by: user?.id` |
| `ConvertContactoModal.tsx` (línea 27) | ❌ No lo incluye |
| `useCreadores.ts` — `useAddCreador` (línea 150) | ❌ Depende de que el caller lo pase |
| `useCreadores.ts` — `useAddCreadorWithBusiness` (línea 209) | ❌ Depende de que el caller lo pase |
| `useProspectos.ts` — `useStartOnboarding` (línea 130) | ❌ No lo incluye |

**Trigger `cleanup_closer_on_creator_insert`**: No toca `created_by`. Solo marca contactos como `converted` y limpia `closer_creators`. No es el problema.

**Causa raíz**: La mayoría de los puntos de inserción no incluyen `created_by`. `ClosersContent.tsx` lo hace pero usa `user?.id` (con optional chaining), lo cual podría pasar `undefined` si `getUser()` falla silenciosamente.

### Cambios

**1. `src/pages/contactos/ConvertContactoModal.tsx`**
- Obtener el usuario autenticado con `supabase.auth.getUser()` antes del insert
- Agregar `created_by: user.id` al objeto de inserción en `creators`

**2. `src/pages/closers/ClosersContent.tsx`**
- Cambiar `created_by: user?.id` a validación estricta: si `!user` → throw error
- Esto ya funciona pero el optional chaining permite `undefined`

**3. `src/pages/creadores/prospectos/useProspectos.ts`** (useStartOnboarding)
- Obtener `user` de `useAuth` y pasar `created_by: user.id` en el insert a `creators`

**4. `src/pages/creadores/useCreadores.ts`** (useAddCreadorWithBusiness)
- Obtener `user` con `supabase.auth.getUser()` y asegurar que `created_by` se incluya en el insert si no viene en el payload

### Sin migraciones SQL
No se requiere ningún cambio en la base de datos. La columna `created_by` ya existe y acepta UUID nullable. El trigger no interfiere.

### Archivos a modificar
- `src/pages/contactos/ConvertContactoModal.tsx`
- `src/pages/closers/ClosersContent.tsx`
- `src/pages/creadores/prospectos/useProspectos.ts`
- `src/pages/creadores/useCreadores.ts`

