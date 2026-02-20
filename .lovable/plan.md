

## Alinear checkbox con su label

El checkbox y el texto "Confirmo que los datos proporcionados son correctos" no estan alineados verticalmente porque el contenedor usa `items-start`, lo que empuja el checkbox hacia arriba respecto al texto.

### Cambio

**Archivo:** `src/pages/creadores/onboarding/steps/Step2Documentation.tsx` (linea 100)

Cambiar `items-start` por `items-center` en el div contenedor del checkbox:

```tsx
// Antes
<div className="flex items-start gap-3 pt-2">

// Despues
<div className="flex items-center gap-3 pt-2">
```

Esto centra verticalmente el checkbox con la primera linea del label.

