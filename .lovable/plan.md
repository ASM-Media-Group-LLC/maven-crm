

## Plan: Cambiar ruta de facturación

Cambiar la ruta `/finanzas/facturacion/nuevo` a `/finanzas/facturacion/facturas/nueva` en 3 lugares:

| Archivo | Cambio |
|---------|--------|
| `src/App.tsx` (línea 254) | Cambiar `path="/finanzas/facturacion/nuevo"` → `path="/finanzas/facturacion/facturas/nueva"` |
| `src/pages/finanzas/facturacion/FacturacionPage.tsx` (línea 459) | Cambiar `navigate("/finanzas/facturacion/nuevo")` → `navigate("/finanzas/facturacion/facturas/nueva")` |
| `src/pages/finanzas/facturacion/NuevoInvoicePage.tsx` | Actualizar el breadcrumb/navegación de vuelta si referencia la ruta antigua |

No se modifica ningún contenido de página, solo las URLs.

