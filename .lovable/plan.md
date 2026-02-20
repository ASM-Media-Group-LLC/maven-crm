

## Ajuste de layout en Step4WorkConfig

Actualmente los 4 campos de "Interaction Config" están en un `grid grid-cols-1 md:grid-cols-2`, lo que hace que "Preferencia de términos de afecto" y "Restricciones de seguridad" queden en columnas estrechas.

### Cambio

En `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx`, mover los campos de "Preferencia de términos de afecto" y "Restricciones de seguridad" fuera del grid de 2 columnas, colocándolos debajo a ancho completo. Los dos selects (Permiso de identidad real y Orientación declarada) se mantienen en el grid de 2 columnas.

### Estructura resultante

```
[Permiso identidad real] [Orientación perfil]   ← grid 2 cols
[Preferencia términos de afecto ──────────────]  ← full width
[Restricciones de seguridad ──────────────────]  ← full width
```

### Archivo a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx` | Extraer los dos campos del grid de 2 columnas y colocarlos como elementos independientes a ancho completo debajo del grid |

