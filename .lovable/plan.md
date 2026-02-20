
## Arquitectura robusta: Vinculación Empleado ↔ Usuario de plataforma

### El problema de fondo

Actualmente `employees.profile_id` existe en la base de datos pero **nunca se usa en la UI**. Esto crea una brecha peligrosa:

- Un empleado puede existir sin cuenta de plataforma → OK (ej: operario sin acceso)
- Un usuario de plataforma puede existir sin ficha de empleado → OK (ej: admin externo)
- Pero **no hay forma de conectarlos**, lo que significa que cuando un empleado tiene cuenta, el sistema no lo sabe y los módulos de HR no saben quién está logueado

La solución es implementar el vínculo `profile_id` de forma visible y manejable en la UI, sin forzar que todo empleado tenga usuario ni viceversa.

---

### Regla de negocio establecida

```text
EMPLEADO  ──[profile_id opcional]──►  PROFILE (usuario de plataforma)

Caso A: Empleado SIN usuario        → ficha HR existe, sin acceso a plataforma
Caso B: Empleado CON usuario        → profile_id apunta a profiles.id
Caso C: Usuario SIN empleado        → admin externo, sin ficha HR
```

---

### Cambios de UI a implementar

#### 1. Panel de Empleado — Tab "Acceso a Plataforma" (nuevo)

En `EmployeeProfile.tsx`, agregar una pestaña nueva llamada **"Acceso"** que muestre:

- Si `profile_id` está null → Card con estado "Sin acceso a plataforma" + botón "Vincular usuario"
- Si `profile_id` existe → Card con estado "Acceso activo" mostrando nombre y rol del usuario vinculado + botón "Desvincular"

Un `Popover` + combobox de búsqueda permite seleccionar un `profile` existente de la tabla `profiles` para vincularlo.

La vinculación guarda `profile_id` en la fila `employees` vía `supabase.from("employees").update({ profile_id })`.

#### 2. Formulario Nuevo Empleado — Paso opcional "Acceso"

En `EmployeeNew.tsx`, agregar un **Paso 5 opcional** al final del wizard con título "Acceso a Plataforma (opcional)":
- Combobox para buscar y vincular un usuario existente
- O dejar en blanco si el empleado no tendrá acceso

#### 3. Panel de Admin Usuarios — Columna "Empleado vinculado"

En `UsersTable.tsx` y `UsersGrid.tsx`, agregar una columna/info que muestre si ese usuario de plataforma tiene un empleado vinculado:

- Si tiene → pequeño badge con el nombre del empleado + link a su perfil `/hr/empleado/{id}`
- Si no → texto "Sin ficha HR" en muted

Esto requiere que `useAdminUsers` consulte también `employees` buscando `profile_id` que coincida con cada `profiles.id`.

#### 4. Fix de filtros en `EmployeeDirectory.tsx`

Los selects de `deptFilter` y `statusFilter` usan `value="all"` con `<SelectItem value="all">`, el mismo bug que ya corregimos en HRAbsences. Aplicar el mismo patrón `__all__` + sentinel value.

---

### Nuevo hook `useProfileEmployeeLink`

```ts
// Verifica si un profile_id ya tiene empleado vinculado
// Obtiene lista de profiles sin empleado vinculado (para el combobox)
export function useUnlinkedProfiles() { ... }
export function useLinkEmployeeProfile(employeeId) { ... }
export function useUnlinkEmployeeProfile(employeeId) { ... }
```

---

### Qué NO se toca (para mantener consistencia)

- No se modifican las migraciones de DB (profile_id ya existe en employees)
- No se cambia el sistema de auth ni los roles
- No se sincronizan datos entre empleado y usuario (son entidades separadas que se vinculan, no se fusionan)
- Los módulos de HR (asistencia, permisos, ausencias) siguen usando `employee_id` como referencia primaria — esto es correcto y no cambia

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/hooks/useEmployees.ts` | Agregar `useUnlinkedProfiles`, `useLinkEmployeeProfile`, `useUnlinkEmployeeProfile`; actualizar `EmployeeWithRelations` con `profile_id` |
| `src/pages/hr/EmployeeProfile.tsx` | Agregar tab "Acceso" con estado de vinculación y combobox para vincular/desvincular |
| `src/pages/hr/EmployeeNew.tsx` | Agregar paso 5 opcional de acceso; también fix `type="date"` → Popover + Calendar |
| `src/pages/admin/useAdminUsers.ts` | Enriquecer query con datos del empleado vinculado (join employees por profile_id) |
| `src/pages/admin/UsersTable.tsx` | Agregar columna "Empleado" con badge de vínculo |
| `src/pages/admin/UsersGrid.tsx` | Agregar info de empleado vinculado en las cards |
| `src/pages/hr/EmployeeDirectory.tsx` | Fix filtros `deptFilter`/`statusFilter` con patrón `__all__` |

---

### Indicador visual del vínculo (EmployeeProfile — Tab Acceso)

```text
┌─ Tab: Acceso a Plataforma ──────────────────────────────────┐
│                                                             │
│  ┌─ Card ──────────────────────────────────────────────┐   │
│  │  [🔗] Estado de Acceso                              │   │
│  │                                                     │   │
│  │  SIN VÍNCULO:                                       │   │
│  │  ● Sin acceso a plataforma                          │   │
│  │  "Este empleado no tiene cuenta de usuario          │   │
│  │   vinculada. Puede operar sin acceso o puede        │   │
│  │   vincularse a un usuario existente."               │   │
│  │  [Vincular usuario existente ▾]                     │   │
│  │                                                     │   │
│  │  CON VÍNCULO:                                       │   │
│  │  ● Acceso activo                                    │   │
│  │  Avatar + Nombre del usuario                        │   │
│  │  Rol: [badge admin/manager/employee]                │   │
│  │  [Desvincular]                                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

### Nota sobre `EmployeeNew.tsx` y `type="date"`

Los campos `hire_date` y `birth_date` actualmente usan `<Input type="date" />` que viola el design system (se debe usar Popover + Shadcn Calendar). Se corregirán en el mismo paso, siguiendo la memoria de constraints registrada.
