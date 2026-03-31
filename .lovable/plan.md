

## Plan: Aumentar espacio entre Billing y Invoice Details

### Cambio único en `InvoiceA4Preview.tsx`

Línea 84: cambiar `mb-4` a `mb-8` en el div del bloque de billing para aumentar el espacio antes de "Invoice details".

```tsx
// Antes
<div className="mb-4 text-[9px]">

// Después
<div className="mb-8 text-[9px]">
```

Esto duplica el margen inferior del bloque de billing (de ~16px a ~32px), creando una separación visual más clara antes de "Invoice details". El cambio aplica tanto a la creación como a la vista final ya que ambos usan el mismo componente.

