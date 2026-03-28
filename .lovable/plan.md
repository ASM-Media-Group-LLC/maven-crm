

## Plan: Mostrar Blue solo cuando Blue Package está activo

### Cambio
En `src/pages/finanzas/comisiones/NuevaComisionModal.tsx`, línea 190:

**Actual:** `{hasBlue && base > 0 && (`
**Corregir a:** `{hasBlue && (`

Esto hará que la fila "Blue" se muestre siempre que el creador tenga Blue Package activo con un monto configurado, sin requerir que se haya ingresado una ganancia.

### Archivo
- **Modificar**: `src/pages/finanzas/comisiones/NuevaComisionModal.tsx` (1 línea)

