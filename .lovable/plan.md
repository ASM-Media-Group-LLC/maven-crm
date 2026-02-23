

## Quitar texto "Gestionar" del botón

Dejar solo el icono de engranaje (Settings2) en los botones de acción, eliminando la palabra "Gestionar".

### Cambios

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/onboarding/OnboardingTable.tsx` (línea ~71) | Quitar texto "Gestionar", cambiar `size="sm"` a `size="icon"` y ajustar clases del icono |
| `src/pages/creadores/onboarding/OnboardingGrid.tsx` (línea ~56) | Quitar texto "Gestionar", cambiar a `size="icon"` y quitar `w-full` |

Ambos botones quedarán como botones de solo icono con el engranaje Settings2.

