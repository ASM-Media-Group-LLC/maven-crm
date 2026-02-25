

## Plan: Mejoras de escalabilidad y robustez en gestión de roles y usuarios

### Problemas identificados

#### 1. Permisos configurados pero nunca aplicados
El sistema tiene `roles_config` + `role_permissions` con UI completa para configurar permisos granulares por módulo, pero **ningún componente los lee para controlar acceso**. El sidebar usa `isAdmin` hardcodeado, las rutas usan `AdminRoute` con check directo a `user_roles`. Los permisos guardados en `role_permissions` son decorativos.

#### 2. Dos sistemas de roles desconectados
- `user_roles.role` es un texto libre (`app_role` enum en el tipo, pero text en DB)
- `roles_config` es una tabla dinámica con `name`, `is_active`, permisos, etc.
- No hay FK entre ambas — un usuario puede tener rol "agent" en `user_roles` pero no existir "agent" en `roles_config`
- La UI de "Cambiar Rol" en ChangeRoleModal tiene roles hardcodeados, no lee de `roles_config`

#### 3. `manage-user-roles` edge function tiene roles hardcodeados
La validación `["admin", "manager", "employee"]` ignora agent, closer y supervisor. Si se asigna uno de estos roles via esa función, falla.

#### 4. Emails no visibles en la gestión de usuarios
`useAdminUsers` pone `email: ""` porque `auth.users` no es accesible desde el cliente. El edge function `admin-user-actions` sí tiene acceso via service role pero no expone un action para listar usuarios con emails.

#### 5. `getClaims` puede no existir en versiones recientes de Supabase
Ambas edge functions (`admin-user-actions`, `manage-user-roles`) usan `anonClient.auth.getClaims(token)` que no es un método estándar del SDK. Debería usarse `adminClient.auth.getUser(token)` o `anonClient.auth.getUser()`.

#### 6. KPI cards en AdminUsuarios no usan DashboardMetricCard
Usan divs manuales sin el hover estándar que acabamos de estandarizar.

### Cambios propuestos

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `src/hooks/usePermissions.ts` | **Nuevo**: Hook que lee `role_permissions` del rol actual del usuario y expone `canAccess(module, submodule?)` |
| 2 | `src/components/dashboard/DashboardSidebar.tsx` | Usar `usePermissions` para mostrar/ocultar secciones del menú en vez de `isAdmin` hardcodeado |
| 3 | `src/components/AdminRoute.tsx` | Renombrar a `ProtectedModuleRoute` y usar `usePermissions` para validar acceso al módulo, no solo `isAdmin` |
| 4 | `src/pages/admin/ChangeRoleModal.tsx` | Leer roles dinámicamente de `roles_config` (solo los activos) en vez de lista hardcodeada |
| 5 | `supabase/functions/manage-user-roles/index.ts` | Validar roles contra `roles_config` en DB en vez de array hardcodeado; usar `getUser` en vez de `getClaims` |
| 6 | `supabase/functions/admin-user-actions/index.ts` | Agregar action `list_users` que retorna perfiles + emails desde `auth.admin.listUsers()`; usar `getUser` en vez de `getClaims` |
| 7 | `src/pages/admin/useAdminUsers.ts` | Llamar al nuevo action `list_users` del edge function para obtener emails reales |
| 8 | `src/pages/admin/AdminUsuarios.tsx` | Reemplazar divs de KPI por `DashboardMetricCard` con prop `color` |

### Detalle técnico

**Hook `usePermissions`**:
```text
usePermissions() → {
  canAccess(module: string, submodule?: string): boolean
  dataScope(module: string): "all" | "subordinates" | "self"
  isLoading: boolean
}
```
- Lee el rol del usuario via `useUserRole`
- Busca el `roles_config.id` que coincida con el nombre del rol
- Consulta `role_permissions` filtrado por ese `role_id`
- Admin sin permisos configurados → acceso total (fallback)
- Cache con staleTime largo (5 min)

**Edge functions — auth fix**:
```typescript
// Antes (puede fallar):
const { data: claimsData } = await anonClient.auth.getClaims(token);
const callerId = claimsData.claims.sub;

// Después (estándar):
const { data: { user }, error } = await adminClient.auth.getUser(token);
const callerId = user.id;
```

**Validación dinámica de roles en edge function**:
```typescript
// Antes:
if (!["admin", "manager", "employee"].includes(role)) { ... }

// Después:
const { data: validRole } = await adminClient
  .from("roles_config")
  .select("id")
  .eq("name", role)
  .eq("is_active", true)
  .maybeSingle();
if (!validRole) { return error("Invalid or inactive role"); }
```

**Action `list_users`**:
```typescript
if (action === "list_users") {
  const { data: { users } } = await adminClient.auth.admin.listUsers();
  // Retorna id + email de cada user
  return Response(JSON.stringify({
    users: users.map(u => ({ id: u.id, email: u.email }))
  }));
}
```

### Orden de implementación

1. Fix de `getClaims` → `getUser` en ambas edge functions (crítico — puede estar fallando)
2. Validación dinámica de roles en `manage-user-roles`
3. Action `list_users` en `admin-user-actions` + actualizar `useAdminUsers`
4. Hook `usePermissions` + integración en sidebar
5. `ChangeRoleModal` dinámico desde `roles_config`
6. KPI cards con `DashboardMetricCard`

### Impacto

- Los permisos configurados en la UI empiezan a funcionar realmente
- El sidebar se adapta dinámicamente al rol del usuario
- Los roles son extensibles sin cambiar código (se gestionan desde `roles_config`)
- Los emails son visibles en la gestión de usuarios
- Las edge functions usan autenticación estándar y robusta

