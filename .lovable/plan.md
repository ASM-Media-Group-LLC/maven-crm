

## Plan: Acceso limitado de Closers al módulo Creadores (solo crear y ver los suyos)

### Problema
Los closers actualmente tienen `can_access = true` para todo el módulo Creadores (Dashboard, Lista, Onboarding, Offboarding, Personalizados). Necesitan poder:
1. Crear nuevas creadoras (formulario `/creadores/nuevo`)
2. Ver solo las creadoras que ellos crearon en el listado `/creadores`
3. **NO** acceder a Dashboard, Onboarding, Offboarding, Personalizados ni ver el listado completo

### Problema adicional: `creators` no tiene `created_by`
La tabla `creators` no tiene columna `created_by`, pero sí tiene `closer_responsible_id` que se llena al convertir desde Closers. Podemos usar esa columna para filtrar "mis creadoras".

### Cambios

#### 1. Migración SQL — Configurar permisos por submódulo para closer
En `role_permissions`, cambiar de acceso total al módulo a acceso granular por submódulo:
- `Creadores` (module-level): `can_access = true` (necesario para que el sidebar lo muestre)
- `Creadores` / `Lista`: `can_access = true` 
- `Creadores` / `Nuevo`: `can_access = true`
- `Creadores` / `Dashboard`: `can_access = false`
- `Creadores` / `Onboarding`: `can_access = false`
- `Creadores` / `Offboarding`: `can_access = false`
- `Creadores` / `Personalizados`: `can_access = false`

#### 2. `DashboardSidebar.tsx` — Filtrar sub-items por permisos
Actualmente `creadoresSubItems` muestra siempre Dashboard, Listado, Onboarding, Offboarding. Cambiar para que cada sub-item se filtre con `canAccess("Creadores", submodule)`:
```
const creadoresSubItems = [
  { title: "Dashboard", url: "/creadores/dashboard", submodule: "Dashboard" },
  { title: "Listado", url: "/creadores", submodule: "Lista" },
  { title: "Onboarding", url: "/creadores/onboarding", submodule: "Onboarding" },
  { title: "Offboarding", url: "/creadores/offboarding", submodule: "Offboarding" },
].filter(item => canAccess("Creadores", item.submodule));
```

#### 3. `App.tsx` — Proteger rutas con submódulos
Agregar `submodule` a los `PermissionRoute` de cada ruta de Creadores:
- `/creadores/dashboard` → `submodule="Dashboard"`
- `/creadores` → `submodule="Lista"`
- `/creadores/onboarding` → `submodule="Onboarding"`
- `/creadores/offboarding` → `submodule="Offboarding"`
- `/creadores/nuevo` → `submodule="Nuevo"`
- `/creadores/personalizados` → `submodule="Personalizados"`

#### 4. `CreadoresContent.tsx` — Filtrar listado para closers
Importar `useUserRole` y `useAuth`. Si el usuario es closer, filtrar los creators por `closer_responsible_id === user.id` para que solo vea los que él creó/convirtió. Ocultar también el botón "Agregar Creador" (los closers crean desde el módulo Closers con "Convertir a Creadora").

#### 5. Agregar columna `created_by` a `creators` (migración)
Para un filtrado más preciso, agregar `created_by UUID REFERENCES auth.users(id)` a la tabla `creators`. Actualizar `handleConvertToCreator` en `ClosersContent.tsx` y `NuevoCreadorForm` para guardar `auth.uid()` en `created_by`. Luego filtrar por `created_by` en vez de `closer_responsible_id`.

### Archivos a modificar
- Migración SQL — permisos por submódulo para closer + columna `created_by`
- `src/components/dashboard/DashboardSidebar.tsx` — filtrar sub-items por submódulo
- `src/App.tsx` — agregar `submodule` a PermissionRoute de cada ruta Creadores
- `src/pages/creadores/CreadoresContent.tsx` — filtrar listado para closers
- `src/pages/closers/ClosersContent.tsx` — guardar `created_by` al convertir

