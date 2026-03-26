

## Plan: Nueva vista "Nota de Pago" en `/finanzas/facturacion/notasdepago/nueva`

### Resumen
Crear una página idéntica en estructura y layout a `NuevoInvoicePage` pero adaptada al contexto de "Notas de Pago", guardando en la tabla `creator_payments`.

### Cambios

**1. Nuevo archivo `src/pages/finanzas/facturacion/NuevaNotaPagoPage.tsx`**

Copia de `NuevoInvoicePage.tsx` con estas adaptaciones:
- **Header**: Breadcrumb "Facturación › Nueva Nota de Pago", título "Nueva Nota de Pago", subtítulo "Crea una nueva nota de pago para un creador"
- **Formulario** (columna izquierda):
  - Creador (combobox searchable, igual)
  - Monto (input number, igual)
  - Tipo de Pago (select: Standard, Adelanto, Bonus, Ajuste — campo `payment_type`)
  - Método de Pago (select: PayPal, Transferencia, Crypto, Otro — igual)
  - Fecha de Vencimiento (date input → `due_date`)
  - Notas (textarea, igual)
  - Sin campos de fee (las notas de pago no aplican fee)
- **Preview A4** (columna derecha): Mismo visor con zoom, pero el documento dice:
  - Título: "Nota de Pago" en lugar de "Invoice"
  - Sección "Pay to" en lugar de "Bill to"
  - "Payment details" en lugar de "Invoice details" (sin Invoice no., con Payment date)
  - Tabla con columna "Concepto" / "Descripción" / "Monto" — fila única con el tipo de pago
  - Total sin deducciones de fee
  - Footer igual con branding KASH AGENCY
- **Mutación**: Inserta en `creator_payments` con campos `creator_id`, `amount`, `payment_type`, `payment_method`, `due_date`, `notes`, `status: 'pending'`, `created_by`
- **Footer**: Botones "Cancelar" y "Crear Nota de Pago"

**2. Nuevo archivo `src/pages/finanzas/facturacion/NuevaNotaPago.tsx`**

Wrapper con Sidebar + Topbar (igual que `NuevoInvoice.tsx`):
```tsx
<SidebarProvider>
  <DashboardSidebar />
  <DashboardTopbar />
  <NuevaNotaPagoPage />
</SidebarProvider>
```

**3. `src/App.tsx`**

- Importar lazy `NuevaNotaPago`
- Añadir ruta: `<Route path="/finanzas/facturacion/notasdepago/nueva" element={<PermissionRoute module="Finanzas"><NuevaNotaPago /></PermissionRoute>} />`

**4. `src/pages/finanzas/facturacion/FacturacionPage.tsx` (línea 312)**

Cambiar el botón "Crear Nota" de mostrar un toast placeholder a navegar:
```tsx
<Button size="sm" onClick={() => navigate("/finanzas/facturacion/notasdepago/nueva")}>
  <Plus className="h-4 w-4 mr-1" />Crear Nota
</Button>
```

### Tabla destino
La tabla `creator_payments` ya existe con los campos necesarios: `id`, `creator_id`, `amount`, `payment_type`, `status`, `due_date`, `paid_date`, `payment_method`, `notes`, `created_by`, `created_at`, `updated_at`. No se requieren migraciones.

