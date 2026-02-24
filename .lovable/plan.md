

## Fix: Warning de Refs en Iconos Sociales

### Problema detectado

La consola muestra el warning en `/creadores`:

```
Warning: Function components cannot be given refs.
Check the render method of `CreadoresTable`.
at TikTokIcon
```

Es el mismo patron que se corrigio en los componentes de onboarding: los iconos SVG personalizados (`TikTokIcon`, `InstagramIcon`, `XIcon`) no usan `React.forwardRef`, lo que genera warnings cuando Radix UI intenta pasarles refs.

### Solucion

Convertir los tres componentes de iconos a `React.forwardRef` para que acepten refs correctamente. Esto resuelve el warning en todos los lugares donde se usan (CreadoresTable, CreadoresGrid, ViewCreadorModal, RedesTabContent, etc).

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/icons/TikTokIcon.tsx` | Convertir a `React.forwardRef` con tipo `SVGSVGElement` |
| `src/components/icons/InstagramIcon.tsx` | Convertir a `React.forwardRef` con tipo `SVGSVGElement` |
| `src/components/icons/XIcon.tsx` | Convertir a `React.forwardRef` con tipo `SVGSVGElement` |

### Ejemplo del cambio

```tsx
// Antes:
const TikTokIcon = ({ className = "h-4 w-4" }: Props) => (
  <svg ...>{...}</svg>
);

// Despues:
const TikTokIcon = React.forwardRef<SVGSVGElement, Props>(
  ({ className = "h-4 w-4" }, ref) => (
    <svg ref={ref} ...>{...}</svg>
  )
);
TikTokIcon.displayName = "TikTokIcon";
```

### Impacto

- Elimina los warnings de consola en `/creadores` y cualquier otra pagina que use estos iconos
- No cambia el aspecto visual ni el comportamiento
- Mejora la compatibilidad con Radix UI y otros componentes que pasan refs

