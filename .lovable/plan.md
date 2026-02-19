

## Conectar formulario de Onboarding con tabla `creators` y nuevos estados

### Resumen

El formulario ya guarda datos en la tabla `creators` con `status = "onboarding"`. Los cambios necesarios son:

1. Usar los nuevos estados del ciclo de onboarding en lugar del generico "onboarding"
2. Actualizar el hook `useOnboarding` para filtrar por estos estados
3. Actualizar los contadores KPI del dashboard

### Seccion tecnica

**No se requieren migraciones de esquema.** La columna `status` en `creators` es de tipo `text` y ya acepta cualquier valor.

---

**Archivo 1: `src/pages/creadores/onboarding/StartOnboardingModal.tsx`**

- Linea 111: Cambiar `status: "onboarding"` a `status: "borrador"` cuando se guarda como borrador y `status: "pendiente_verificacion"` cuando se finaliza el formulario completo.
- En `buildPayload`: el parametro `isDraft` determinara el status:
  - `isDraft = true` -> `status: "borrador"`
  - `isDraft = false` -> `status: "pendiente_verificacion"`

---

**Archivo 2: `src/pages/creadores/onboarding/useOnboarding.ts`**

- Linea 40: Cambiar `.eq("status", "onboarding")` por `.in("status", ["borrador", "pendiente_verificacion", "verificado", "asignado", "activo"])` para traer todos los registros del ciclo de onboarding.
- Linea 14: Actualizar el tipo de `status` a los nuevos valores: `"Pendiente" | "En Progreso" | "Completado"` (se mantienen como labels de UI).
- Actualizar `deriveStatus` para mapear los nuevos estados de DB a los labels de UI:
  - `pendiente_verificacion` -> "Pendiente"
  - `borrador` o `verificado` -> "En Progreso"
  - `asignado` o `activo` -> "Completado"

---

**Archivo 3: `src/pages/creadores/onboarding/OnboardingContent.tsx`**

- Los contadores en lineas 34-37 ya usan los labels de UI ("Pendiente", "En Progreso", "Completado"), por lo que se actualizaran automaticamente con el cambio en `useOnboarding`.
- Actualizar las labels de los KPI cards para mayor claridad:
  - "Total Onboarding" = Todos los registros (sin cambio)
  - "Pendientes" = Registros en `pendiente_verificacion` (sin cambio, ya filtra por "Pendiente")
  - "En Progreso" = Registros en `borrador` o `verificado` (sin cambio, ya filtra por "En Progreso")
  - "Completados" = Registros en `asignado` o `activo` (sin cambio)

---

### Flujo resultante

```text
Guardar Borrador  -->  status = "borrador"       -->  KPI: "En Progreso"
Finalizar         -->  status = "pendiente_verificacion"  -->  KPI: "Pendientes"
(manual/futuro)   -->  status = "verificado"      -->  KPI: "En Progreso"
(manual/futuro)   -->  status = "asignado"        -->  KPI: "Completados"
(manual/futuro)   -->  status = "activo"          -->  KPI: "Completados"
```

### Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `StartOnboardingModal.tsx` | Status dinamico segun borrador/finalizar |
| `useOnboarding.ts` | Query con `.in()` y mapeo de estados |
| `OnboardingContent.tsx` | Sin cambios funcionales (labels ya coinciden) |

