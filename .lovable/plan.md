

## Revisión del Sistema de Roles y Permisos

### Estado actual de los roles

```text
┌──────────────┬────────────┬──────────────────┬─────────────────────┐
│ Rol          │ Usuarios   │ En roles_config? │ Permisos definidos? │
├──────────────┼────────────┼──────────────────┼─────────────────────┤
│ admin        │ 3          │ Sí               │ Sí (29 registros)   │
│ employee     │ 5          │ NO ⚠️            │ NO                  │
│ manager      │ 0          │ Sí               │ NO ⚠️               │
│ agent        │ 0          │ Sí               │ NO ⚠️               │
│ closer       │ 0          │ Sí               │ NO ⚠️               │
│ supervisor   │ 0          │ Sí               │ NO ⚠️               │
└──────────────┴────────────┴──────────────────┴─────────────────────┘
```

### Problemas detectados

**1. Fallback permisivo critico (usePermissions.ts, linea 47)**
Si un rol no tiene permisos configurados en `role_permissions`, el sistema permite acceso a TODO por defecto:
```
if (permissions.length === 0) return true; // ← Todo abierto
```
Esto significa que los 5 usuarios con rol `employee` y cualquier futuro manager/agent/closer/supervisor tienen acceso completo a toda la plataforma.

**2. Rol "employee" no existe en roles_config**
Hay 5 usuarios con rol `employee` en `user_roles`, pero no existe una entrada correspondiente en `roles_config`. La query de permisos busca en `roles_config` por nombre, no encuentra nada, retorna permisos vacíos, y el fallback permisivo les da acceso total.

**3. Sidebar sin guardias de permisos**
Solo la sección "Administración" del sidebar usa `canAccess()`. Las siguientes secciones son visibles para TODOS los usuarios autenticados sin restricción:
- Creadores (Dashboard, Casting, Onboarding, Listado, Personalizados)
- Ventas (Dashboard, Reportes, IA Ventas)
- Operaciones (Promolog, LeadGen, Closers, Tickets)
- Finanzas (todo el modulo)
- HR (todo el modulo)
- Contactos, Tareas, Eventos, Messenger

**4. Rutas sin proteccion de permisos**
Solo `/admin/*` usa `AdminRoute` con verificacion de permisos. Todas las demas rutas usan `ProtectedRoute` que solo verifica autenticacion, no permisos. Un usuario con rol `employee` puede navegar directamente a `/finanzas/nomina` o `/hr/desempeno`.

### Plan de correcciones

**Paso 1: Cambiar fallback permisivo a restrictivo**
En `usePermissions.ts`, cambiar la logica para que si no hay permisos configurados, se deniegue acceso (excepto Dashboard y Messenger que son universales).

**Paso 2: Crear rol "employee" en roles_config**
Insertar una entrada para `employee` en la tabla `roles_config` con su descripcion.

**Paso 3: Agregar guardias canAccess al sidebar**
Envolver cada seccion del sidebar con su `canAccess` correspondiente:
- Creadores → `canAccess("Creadores")`
- Ventas → `canAccess("Creator Sales")`
- Operaciones → cada item con su modulo (Promolog, LeadGen, Closers, Tickets)
- Finanzas → `canAccess("Finanzas")`
- HR → `canAccess("HR")`
- Contactos → `canAccess("Contactos")`

**Paso 4: Crear PermissionRoute generico**
Un componente similar a `AdminRoute` pero parametrizado para proteger cualquier ruta por modulo/submodulo. Aplicarlo a todas las rutas en `App.tsx`.

**Paso 5: Definir permisos por defecto para cada rol**
Configurar en `role_permissions` los accesos por defecto:

```text
┌──────────────┬─────────────────────────────────────────────────┐
│ Rol          │ Acceso                                          │
├──────────────┼─────────────────────────────────────────────────┤
│ admin        │ Todo (ya configurado + bypass en codigo)        │
│ manager      │ Todo excepto Administración                    │
│ supervisor   │ Creadores, Ventas, HR, Tareas, Tickets         │
│ agent        │ Creadores (solo Insights), Tareas, Messenger   │
│ closer       │ Closers, Ventas, Contactos, LeadGen            │
│ employee     │ Dashboard, Tareas, Messenger                   │
└──────────────┴─────────────────────────────────────────────────┘
```

Estos son valores iniciales configurables despues desde el panel de Administracion.

### Archivos a modificar
- `src/hooks/usePermissions.ts` — Cambiar fallback permisivo
- `src/components/dashboard/DashboardSidebar.tsx` — Agregar guardias canAccess
- `src/components/PermissionRoute.tsx` — Nuevo componente
- `src/App.tsx` — Envolver rutas con PermissionRoute
- Migracion SQL — Crear rol employee + permisos por defecto para todos los roles

