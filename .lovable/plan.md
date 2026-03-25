

## Cambios en el encabezado del A4

**Archivo**: `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`

### 1. Copiar el logo
Copiar `user-uploads://image1.png` a `src/assets/kash-logo.png` e importarlo en el componente.

### 2. Reemplazar el header (líneas 183-194)

**Izquierda**: Título "Invoice" como h2 (`text-lg font-bold`), seguido de 4 líneas en `text-[9px] text-gray-400`:
- KASH AGENCY
- 333 SE 2nd Ave
- 33131-2176
- Miami, FL 33131-2176

**Derecha**: Logo importado desde `src/assets/kash-logo.png`, dimensionado proporcionalmente (~60-70px de ancho).

```tsx
{/* Header */}
<div className="flex justify-between items-start mb-6">
  <div>
    <h2 className="text-lg font-bold tracking-tight text-gray-900">Invoice</h2>
    <p className="text-[9px] text-gray-400 mt-0.5">KASH AGENCY</p>
    <p className="text-[9px] text-gray-400">333 SE 2nd Ave</p>
    <p className="text-[9px] text-gray-400">33131-2176</p>
    <p className="text-[9px] text-gray-400">Miami, FL 33131-2176</p>
  </div>
  <div>
    <img src={kashLogo} alt="KASH" className="h-10 object-contain" />
  </div>
</div>
```

### 3. Eliminar referencias antiguas
- Quitar "Maven CRM" y "Management & Operations" del header.
- Quitar "INVOICE" / "INV-XXXX" / fecha de la columna derecha (esos datos pueden reubicarse debajo si se desea, o eliminarse).

