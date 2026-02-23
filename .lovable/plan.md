

## Sincronizacion y Activacion de la Vista de Onboarding

### Diagnostico

La base de datos confirma: **7 creadores con status "onboarding"**, 1 con "pendiente_verificacion", 1 con "pendiente". Sin embargo, la query actual en `useOnboarding` tambien incluye "verificado", "asignado" y "activo", lo que mezclaria 135+ creadores activos con los de onboarding real. El filtro debe limitarse a los estados previos a "activo".

### Cambios por archivo

---

**Archivo 1: `src/pages/creadores/onboarding/useOnboarding.ts`**

1. Ajustar el filtro de la query para traer solo estados de onboarding real:
   - Antes: `["borrador", "onboarding", "pendiente_verificacion", "verificado", "asignado", "activo"]`
   - Despues: `["borrador", "pendiente", "onboarding", "pendiente_verificacion", "verificado"]`
   - Se eliminan "asignado" y "activo" (ya pasaron onboarding) y se agrega "pendiente" (estado por defecto al convertir contacto)

2. Actualizar `deriveStatus` para mapear correctamente:
   - `"borrador"` y `"pendiente"` -> `"Pendiente"`
   - `"onboarding"` -> `"En Progreso"`
   - `"pendiente_verificacion"` -> `"Pendiente"` (se mantiene)
   - `"verificado"` -> `"Completado"`

---

**Archivo 2: `src/pages/creadores/onboarding/OnboardingTable.tsx`**

Redisenar las columnas de la tabla segun el requerimiento:

| Columna actual | Columna nueva |
|---|---|
| Empleado | Creadora (foto + nombre) |
| Posicion | (se elimina) |
| Area | (se elimina) |
| Empresa | Agencia |
| Fecha Inicio | Fecha Inicio |
| Manager | (se elimina) |
| Progreso | Progreso (barra visual) |
| Estado | Estado (badge de color) |
| (no existia) | Acciones (boton "Gestionar") |

El boton "Gestionar" emitira un callback `onManage(creator)` que se conectara al wizard existente.

---

**Archivo 3: `src/pages/creadores/onboarding/OnboardingGrid.tsx`**

Agregar un boton "Gestionar" en cada card del grid, con el mismo callback `onManage`.

---

**Archivo 4: `src/pages/creadores/onboarding/OnboardingContent.tsx`**

1. Actualizar `inProgressCreators` para incluir `"pendiente"` en el filtro
2. Pasar un handler `onManage` a `OnboardingTable` y `OnboardingGrid` que abra el wizard inline (reutilizando la logica existente de `handleCardClick`)
3. Los KPIs se calculan automaticamente desde los datos filtrados -- no requieren cambio adicional

---

### Resultado esperado

| KPI Card | Contenido |
|---|---|
| Total | 9 (7 onboarding + 1 pendiente_verificacion + 1 pendiente) |
| Pendientes | 2 (pendiente + pendiente_verificacion) |
| En Progreso | 7 (onboarding) |
| Completados | 0 (ningun verificado actualmente) |

La tabla mostrara las 9 creadoras con columnas limpias y boton de accion. Los filtros por agencia funcionaran en tiempo real sobre la tabla.

