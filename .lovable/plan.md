
## Mover "Otra" al final en el tab bar de Onboarding

### Diagnóstico

Revisando los tres arrays de agencias:

| Archivo | Estado actual | ¿Necesita cambio? |
|---|---|---|
| `OnboardingContent.tsx` | `["Todas", "Atomic", "Elite", "Kash", "Otra", "Trafix", "Unlok"]` | Sí — "Otra" está en posición 5 |
| `NuevoCreadorForm.tsx` | `[..., "Trafix", "Otra"]` | No — "Otra" ya es la última |
| `InfoTabContent.tsx` | `[..., "Unlok Platform", "Otra"]` | No — "Otra" ya es la última |

### Cambio

**`src/pages/creadores/onboarding/OnboardingContent.tsx`**

Antes:
```
["Todas", "Atomic Agency", "Elite Models", "Kash Agency", "Otra", "Trafix", "Unlok Platform"]
```

Después:
```
["Todas", "Atomic Agency", "Elite Models", "Kash Agency", "Trafix", "Unlok Platform", "Otra"]
```

"Otra" se mueve al final. "Trafix" y "Unlok Platform" quedan en orden alfabético entre sí.
