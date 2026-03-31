

## Plan: Subpágina "Templates" en Facturación + Aplicación dinámica al Invoice A4

### Resumen

Crear una subpágina `/finanzas/facturacion/templates` dentro de Facturación con tabla de templates, modal de creación, y aplicación dinámica de los datos del template (logo, nombre, dirección, email) al documento A4 del Invoice.

---

### 1. Base de datos — tabla `invoice_templates`

Migración SQL:

```sql
CREATE TABLE public.invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'invoice', -- 'invoice' | 'nota_pago'
  company_name TEXT,
  company_address TEXT,
  company_email TEXT,
  logo_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view templates"
  ON public.invoice_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert templates"
  ON public.invoice_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update templates"
  ON public.invoice_templates FOR UPDATE TO authenticated USING (true);
```

+ Storage bucket `template-logos` (public) para subir logos.

### 2. Sidebar — Agregar "Templates" bajo "Invoices"

En `DashboardSidebar.tsx`, dentro del grupo `fin-fact` (Facturación), agregar item:
```
{ title: "Templates", url: "/finanzas/facturacion/templates" }
```

### 3. Ruta en App.tsx

Agregar lazy import y ruta:
```
/finanzas/facturacion/templates → TemplatesPage (dentro de FinanzasLayout)
```

### 4. Página `TemplatesPage.tsx`

**Archivo:** `src/pages/finanzas/facturacion/TemplatesPage.tsx`

- Header fijo con breadcrumb `Facturación › Templates` y botón "Crear Template"
- Tabla con columnas: Nombre, Tipo (badge Invoice/Nota de pago), Fecha creación, Creador, Acciones (ver/editar)
- Hook `useQuery` para leer `invoice_templates` con join a `profiles` para nombre del creador
- Al hacer clic en "Crear Template" → abre modal

### 5. Modal `CreateTemplateModal.tsx`

**Archivo:** `src/pages/finanzas/facturacion/CreateTemplateModal.tsx`

- Campo: Nombre del template (text)
- Campo: Tipo (select: Invoice / Nota de pago)
- Si tipo === "invoice":
  - Nombre de la compañía (text)
  - Dirección (text)
  - Correo electrónico (text)
  - Logo: Drag & drop / click para subir imagen → sube a bucket `template-logos`
- Botón Crear → inserta en `invoice_templates`
- También sirve para editar (recibe template opcional como prop)

### 6. Aplicar template al Invoice A4

Modificar `InvoiceA4Preview.tsx` y `NuevoInvoicePage.tsx`:

- Agregar prop opcional `template?: { company_name, company_address, company_email, logo_url }` a `InvoiceA4Preview`
- Si hay template: usar `template.company_name` en lugar de "KASH AGENCY", `template.logo_url` en lugar de `kashLogo`, `template.company_address` en lugar de la dirección hardcodeada, y `template.company_email` en lugar del email hardcodeado
- Si no hay template: mantener los valores actuales de KASH AGENCY (backward compatible)
- En `NuevoInvoicePage`: agregar selector de template (dropdown) que carga los templates tipo "invoice" y pasa el seleccionado al preview

### Archivos a crear/modificar

| Acción | Archivo |
|--------|---------|
| Crear | `src/pages/finanzas/facturacion/TemplatesPage.tsx` |
| Crear | `src/pages/finanzas/facturacion/CreateTemplateModal.tsx` |
| Modificar | `src/pages/finanzas/facturacion/InvoiceA4Preview.tsx` — prop template opcional |
| Modificar | `src/pages/finanzas/facturacion/NuevoInvoicePage.tsx` — selector de template |
| Modificar | `src/components/dashboard/DashboardSidebar.tsx` — item Templates |
| Modificar | `src/App.tsx` — ruta |
| Migración | tabla `invoice_templates` + bucket `template-logos` + RLS |

