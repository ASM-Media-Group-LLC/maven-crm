

## Fix: Warning de Refs en Tooltip de OnboardingTable

### Problema detectado

Al renderizar la pagina `/creadores/onboarding`, la consola muestra un warning de React:

```
Warning: Function components cannot be given refs.
Check the render method of `OnboardingTable`.
```

Esto ocurre porque el componente `Tooltip` de Radix UI esta recibiendo un ref indirectamente cuando se usa dentro de celdas de tabla (`TableCell`). El `TooltipTrigger` con `asChild` necesita que su hijo directo sea un elemento que acepte refs.

### Causa raiz

En `OnboardingTable.tsx`, el `Tooltip` en la columna "Docs" (lineas 84-91) y el tooltip junto al nombre (lineas 58-64) funcionan correctamente con `ShieldAlert` (que acepta refs), pero el wrapper `Tooltip` en si esta siendo montado en un contexto donde React intenta pasarle un ref.

### Solucion

Envolver los iconos `ShieldAlert` dentro de un `<span>` para asegurar que `TooltipTrigger asChild` reciba un elemento HTML nativo que siempre acepta refs:

**Archivo:** `src/pages/creadores/onboarding/OnboardingTable.tsx`

Cambio 1 - Tooltip junto al nombre (linea 59):
```tsx
// Antes:
<TooltipTrigger asChild>
  <ShieldAlert className="h-4 w-4 text-orange-500 shrink-0" />
</TooltipTrigger>

// Despues:
<TooltipTrigger asChild>
  <span className="inline-flex shrink-0">
    <ShieldAlert className="h-4 w-4 text-orange-500" />
  </span>
</TooltipTrigger>
```

Cambio 2 - Tooltip en columna Docs (linea 87):
```tsx
// Antes:
<TooltipTrigger asChild>
  <ShieldAlert className="h-4 w-4 text-orange-500" />
</TooltipTrigger>

// Despues:
<TooltipTrigger asChild>
  <span className="inline-flex">
    <ShieldAlert className="h-4 w-4 text-orange-500" />
  </span>
</TooltipTrigger>
```

**Archivo:** `src/pages/creadores/onboarding/OnboardingGrid.tsx`

Cambio similar en linea 48-49:
```tsx
<TooltipTrigger asChild>
  <span className="inline-flex shrink-0">
    <ShieldAlert className="h-4 w-4 text-orange-500" />
  </span>
</TooltipTrigger>
```

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/onboarding/OnboardingTable.tsx` | Envolver ShieldAlert en span dentro de TooltipTrigger (2 lugares) |
| `src/pages/creadores/onboarding/OnboardingGrid.tsx` | Envolver ShieldAlert en span dentro de TooltipTrigger (1 lugar) |

### Impacto

- Elimina los warnings de consola
- No cambia el comportamiento visual ni funcional
- Mantiene los tooltips y las alertas visuales intactos
