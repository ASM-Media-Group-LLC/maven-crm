

## Fix: Scroll en selector de creador (Comisiones e Invoices)

### Problema
El `CommandList` dentro del `Popover` no permite hacer scroll cuando está dentro de un `Dialog`. Esto ocurre porque el `Dialog` de Radix intercepta los eventos de scroll/wheel.

### Solución
Agregar `onWheel={(e) => e.stopPropagation()}` en el `CommandList` de ambos modales para evitar que el Dialog capture el evento de scroll.

### Archivos a modificar

**1. `src/pages/finanzas/comisiones/NuevaComisionModal.tsx`** (~línea 127)
- Agregar `onWheel` stop propagation al `CommandList`

**2. `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`** (~línea 196)
- Mismo cambio en el `CommandList` del selector de creador

### Cambio específico
```tsx
// Antes
<CommandList>

// Después
<CommandList onWheel={(e) => e.stopPropagation()}>
```

