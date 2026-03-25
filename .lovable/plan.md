

## Cambios en el encabezado del A4

**Archivo**: `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx` (líneas 184-196)

### Modificaciones
1. **Línea 190**: Cambiar "33131-2176" → "Miami, FL 33131-2176"
2. **Línea 191**: Cambiar "Miami, FL 33131-2176" → "kash@exclusivecontent.me"
3. **Línea 194**: Aumentar el logo de `h-10` a `h-14`

```tsx
{/* Header */}
<div className="flex justify-between items-start mb-6">
  <div>
    <h2 className="text-lg font-bold tracking-tight text-gray-900">Invoice</h2>
    <p className="text-[9px] text-gray-400 mt-0.5">KASH AGENCY</p>
    <p className="text-[9px] text-gray-400">333 SE 2nd Ave</p>
    <p className="text-[9px] text-gray-400">Miami, FL 33131-2176</p>
    <p className="text-[9px] text-gray-400">kash@exclusivecontent.me</p>
  </div>
  <div>
    <img src={kashLogo} alt="KASH" className="h-14 object-contain" />
  </div>
</div>
```

