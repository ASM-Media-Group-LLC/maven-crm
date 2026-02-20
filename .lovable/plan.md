
## Estandarizar el orden de agencias en todos los listados

### Diagnóstico completo

| Archivo | Situación actual | ¿Necesita cambio? |
|---|---|---|
| `OnboardingContent.tsx` | `["Todas", "Atomic Agency", "Elite Models", "Kash Agency", "Trafix", "Unlok Platform", "Otra"]` | Ya correcto |
| `CreadoresContent.tsx` | Tab bar dinámico — orden alfabético de BD | Sí — agregar orden fijo |
| `useCreadores.ts` | `uniqueAgencies()` hace `.sort()` alfabético | Sí — aplicar orden canónico |
| `NuevoCreadorForm.tsx` | `["Kash Agency", "Atomic Agency", "Unlok Platform", ...]` | Sí — orden incorrecto |
| `InfoTabContent.tsx` | `["Atomic Agency", "Elite Models", "Kash Agency", "Trafix", "Unlok Platform", "Otra"]` | Ya correcto |

### Orden canónico a aplicar en todos lados

```
Atomic Agency, Elite Models, Kash Agency, Unlok Platform, Trafix, Otra
```

### Cambios por archivo

**1. `src/pages/creadores/useCreadores.ts`**

La función `uniqueAgencies()` actualmente hace `.sort()` alfabético. Se reemplaza por un sort basado en el orden canónico para que el tab bar del Listado muestre las agencias en el orden correcto:

```ts
const AGENCY_ORDER = [
  "Atomic Agency", "Elite Models", "Kash Agency",
  "Unlok Platform", "Trafix", "Otra"
];

function uniqueAgencies(creators: CreatorWithBusiness[]): string[] {
  const set = new Set<string>();
  for (const c of creators) {
    const agency = c.creator_business?.assigned_agency;
    if (agency) set.add(agency);
  }
  const known = AGENCY_ORDER.filter((a) => set.has(a));
  const others = Array.from(set).filter((a) => !AGENCY_ORDER.includes(a)).sort();
  return [...known, ...others];
}
```

Esto garantiza que las agencias conocidas aparezcan en orden canónico, y cualquier agencia nueva en BD quede al final en orden alfabético.

**2. `src/pages/creadores/NuevoCreadorForm.tsx`**

Corregir el orden del array `AGENCIES` (actualmente empieza con "Kash Agency"):

```ts
// Antes
const AGENCIES = ["Kash Agency", "Atomic Agency", "Unlok Platform", "Elite Models", "ORA Agency", "Exchange", "Trafix", "Otra"];

// Después
const AGENCIES = ["Atomic Agency", "Elite Models", "Kash Agency", "Unlok Platform", "Trafix", "ORA Agency", "Exchange", "Otra"];
```

### Resumen de archivos a modificar

| Archivo | Cambio |
|---|---|
| `useCreadores.ts` | Reemplazar `uniqueAgencies()` con sort por orden canónico |
| `NuevoCreadorForm.tsx` | Reordenar el array `AGENCIES` |

`OnboardingContent.tsx` e `InfoTabContent.tsx` ya tienen el orden correcto — no se tocan.
