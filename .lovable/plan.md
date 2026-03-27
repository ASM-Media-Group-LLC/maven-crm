

## Plan: Agregar cursor pointer al botón de cierre

### Problema
El botón X funciona correctamente pero falta la clase `cursor-pointer` para que el cursor cambie al pasar sobre él.

### Cambio

**Archivo: `src/pages/finanzas/facturacion/FacturacionPage.tsx` (línea 610)**

Agregar `cursor-pointer` a las clases del botón:

```tsx
className="fixed top-5 right-5 z-[60] text-white/80 hover:text-white transition-colors cursor-pointer"
```

Un cambio de una sola clase CSS.

