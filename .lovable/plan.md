

## Reestructurar "Invoice Details" en el preview A4

### Cambio
Mover la sección "Invoice details" (líneas 101-111) de su posición actual (a la derecha del billing grid, dentro del `flex justify-between`) a una nueva sección independiente debajo del grid de billing, alineada a la izquierda.

### Estructura resultante

```text
┌─────────────────────────────────────┐
│  Header (Invoice + Logo)            │
├─────────────────────────────────────┤
│  Bill to: ...  ID: ...              │
│  Address: ...                       │
│  Phone: ...                         │
├─────────────────────────────────────┤
│  Invoice details                    │  ← ahora abajo, alineado izquierda
│  Invoice no.: ...                   │
│  Invoice date: ...                  │
│  Due date: ...                      │
│  Payment: ...                       │
├─────────────────────────────────────┤
│  [Tabla de servicios]               │
└─────────────────────────────────────┘
```

### Archivo a editar
**`src/pages/finanzas/facturacion/InvoiceA4Preview.tsx`**

1. En el `div` de línea 84 (`flex justify-between`), eliminar el segundo hijo (líneas 101-111 con "Invoice details") y dejar solo el grid de billing. Quitar `justify-between` ya que solo queda un hijo.
2. Agregar un nuevo `div` después del cierre del bloque de billing (después de línea 112), con clase `mb-5 text-[9px]` y alineación a la izquierda, conteniendo exactamente los mismos campos de Invoice details (número, fecha, vencimiento, método de pago) pero con `text-left` en lugar de `text-right`.

