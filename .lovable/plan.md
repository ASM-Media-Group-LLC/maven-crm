
## Reparacion de la Vista de Onboarding

### Problema raiz

La pagina `/creadores/onboarding` muestra 0 porque el hook `useOnboarding` filtra por los estados `["borrador", "pendiente_verificacion", "verificado", "asignado", "activo"]` pero **no incluye `"onboarding"`**, que es el estado real de los 7 creadores detectados por el dashboard.

La base de datos confirma: 7 creadores con `status = 'onboarding'` y 1 con `status = 'pendiente_verificacion'`.

### Cambios a realizar

**Archivo 1: `src/pages/creadores/onboarding/useOnboarding.ts`**

- Agregar `"onboarding"` a la lista de estados en el filtro `.in("status", [...])`
- Actualizar `deriveStatus` para mapear `"onboarding"` a `"En Progreso"`

**Archivo 2: `src/pages/creadores/onboarding/OnboardingContent.tsx`**

- Ajustar la logica de `inProgressCreators` para incluir tambien `dbStatus === "onboarding"` (ademas de `"borrador"` y `"pendiente_verificacion"`)
- Con esto, la seccion "Onboardings en Curso" mostrara las 7+1 cards con su progreso y boton "Continuar"

### Resultado esperado

| KPI Card | Valor |
|---|---|
| Total | 8 (7 onboarding + 1 pendiente_verificacion) |
| Pendientes | 1 (pendiente_verificacion) |
| En Progreso | 7 (onboarding) |
| Completados | 0 |

La tabla/grid principal mostrara los 8 creadores con sus datos de agencia, fecha de inicio y progreso. La seccion "Onboardings en Curso" mostrara las cards interactivas para continuar cada proceso.

### Detalle tecnico

```text
// useOnboarding.ts - linea 74
Antes:  .in("status", ["borrador", "pendiente_verificacion", "verificado", "asignado", "activo"])
Despues: .in("status", ["borrador", "onboarding", "pendiente_verificacion", "verificado", "asignado", "activo"])

// useOnboarding.ts - deriveStatus
Agregar: if (dbStatus === "onboarding") return "En Progreso";

// OnboardingContent.tsx - inProgressCreators
Antes:  c.dbStatus === "borrador" || c.dbStatus === "pendiente_verificacion"
Despues: c.dbStatus === "borrador" || c.dbStatus === "onboarding" || c.dbStatus === "pendiente_verificacion"
```
