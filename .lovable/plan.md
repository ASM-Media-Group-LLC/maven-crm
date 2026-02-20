
## Agregar "Trafix" a todas las listas de agencias/compañías

### Archivos afectados y cambios exactos

**1. `src/pages/creadores/onboarding/OnboardingContent.tsx` — Tab bar del módulo Onboarding**

Línea 13 actual:
```
const areaTabs = ["Todas", "Atomic Agency", "Elite Models", "Kash Agency", "Otra", "Unlok Platform"];
```
Después:
```
const areaTabs = ["Todas", "Atomic Agency", "Elite Models", "Kash Agency", "Otra", "Trafix", "Unlok Platform"];
```
Trafix se inserta en orden alfabético, antes de "Unlok Platform".

---

**2. `src/pages/creadores/NuevoCreadorForm.tsx` — Select de agencia al registrar un creador nuevo**

Línea 20 actual:
```
const AGENCIES = ["Kash Agency", "Atomic Agency", "Unlok Platform", "Elite Models", "ORA Agency", "Exchange", "Otra"];
```
Después:
```
const AGENCIES = ["Kash Agency", "Atomic Agency", "Unlok Platform", "Elite Models", "ORA Agency", "Exchange", "Trafix", "Otra"];
```

---

**3. `src/pages/creadores/InfoTabContent.tsx` — Select de agencia en el perfil/edición del creador**

Línea 42 actual:
```
const agencyOptions = ["Atomic Agency", "Elite Models", "Kash Agency", "Unlok Platform", "Otra"];
```
Después:
```
const agencyOptions = ["Atomic Agency", "Elite Models", "Kash Agency", "Trafix", "Unlok Platform", "Otra"];
```

---

### Resumen de archivos

| Archivo | Ubicación del cambio |
|---|---|
| `OnboardingContent.tsx` | Array `areaTabs` — tab bar de filtros |
| `NuevoCreadorForm.tsx` | Array `AGENCIES` — select al crear creador |
| `InfoTabContent.tsx` | Array `agencyOptions` — select en edición de perfil |

No se necesitan migraciones de base de datos. El valor `"Trafix"` se almacena directamente como texto en la columna `assigned_agency` de la tabla `creator_business_info`, igual que las demás agencias.
