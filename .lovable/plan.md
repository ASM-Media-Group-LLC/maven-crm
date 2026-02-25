

## Plan: Extender contenido a ancho completo en Candidatos, Onboarding y Offboarding

### Problema

Las tres páginas usan `max-w-3xl` (o `max-w-3xl mx-auto`) que restringe el contenido a ~768px, dejando espacio vacío a los lados. Esto viola el patrón estándar del sistema donde el contenido debe ocupar todo el ancho disponible (`px-6` sin max-width).

### Cambios

| Archivo | Cambio |
|---------|--------|
| `src/pages/hr/HRApplicantNew.tsx` | Línea 89: Quitar `max-w-3xl` del `<Card>` |
| `src/pages/hr/HROnboardingNew.tsx` | Línea 233: Quitar `max-w-3xl mx-auto` del wrapper del stepper. Línea 258: Quitar `max-w-3xl mx-auto` del wrapper del contenido |
| `src/pages/hr/HROffboardingNew.tsx` | Línea 290: Quitar `max-w-3xl mx-auto` del wrapper del stepper. Línea ~314 (wrapper del contenido): Quitar `max-w-3xl mx-auto` |

Esto alinea las tres páginas con el patrón documentado: header fijo con `px-6`, contenido scrolleable con `px-6`, sin anchos máximos restrictivos.

