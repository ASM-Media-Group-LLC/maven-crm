

## Plan: Pasar template al InvoiceA4Preview en vista previa y descarga

### Problema
La query ya hace join con `invoice_templates(*)` (línea 62), así que cada invoice tiene los datos del template en `invoice_templates`. Pero en dos lugares se renderiza `InvoiceA4Preview` sin pasar el prop `template`:

1. **Línea 609** — Vista previa (Dialog "Ver"): `<InvoiceA4Preview invoice={viewItem as any} />` — falta `template`
2. **Línea 222** — Descarga PDF: `root.render(<InvoiceA4PreviewComp invoice={inv} />)` — falta `template`

### Solución

**Archivo: `FacturacionPage.tsx`**

1. **Línea 609**: Cambiar a:
```tsx
{viewItem && (
  <InvoiceA4Preview
    invoice={viewItem as any}
    template={(viewItem as any)?.invoice_templates}
  />
)}
```

2. **Línea 222**: Cambiar a:
```tsx
root.render(<InvoiceA4PreviewComp invoice={inv} template={inv?.invoice_templates} />);
```

Esto es todo. Los datos del template ya están disponibles en el objeto del invoice gracias al join existente; solo falta pasarlos al componente.

