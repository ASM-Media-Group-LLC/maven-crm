

## Unificar la vista de preview entre Templates e Invoices

### Problema
- **Invoices** usa `<Dialog>` con fondo transparente → el A4 flota limpio sobre el overlay oscuro.
- **Templates** usa un `div` manual con `bg-muted rounded-lg p-6` → se ve como una tarjeta gris con título y botón "Cerrar", rompiendo la consistencia visual.

### Solución

**Archivo**: `src/pages/finanzas/facturacion/TemplatesPage.tsx`

Reemplazar el modal manual (líneas 142-160) por un `Dialog` idéntico al de Invoices:

```tsx
<Dialog open={!!viewTemplate} onOpenChange={() => setViewTemplate(null)}>
  <DialogContent className="max-w-fit bg-transparent border-none shadow-none p-0 [&>button:last-child]:hidden">
    {viewTemplate && (
      <InvoiceA4Preview
        invoice={{}}
        template={{
          company_name: viewTemplate.company_name,
          company_address: viewTemplate.company_address,
          company_zip: viewTemplate.company_zip,
          company_email: viewTemplate.company_email,
          logo_url: viewTemplate.logo_url,
        }}
      />
    )}
  </DialogContent>
</Dialog>
```

Agregar imports de `Dialog` y `DialogContent` de `@/components/ui/dialog`.

### Resultado
Ambas vistas (Templates e Invoices) mostrarán el A4 flotando limpio sobre overlay oscuro, con cierre al hacer clic fuera.

