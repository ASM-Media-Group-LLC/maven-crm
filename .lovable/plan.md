

## Convertir "Crear Invoice" de modal a página completa

### Resumen
Reemplazar el modal `CrearInvoiceModal` por una página dedicada en `/finanzas/facturacion/nuevo`, siguiendo el mismo layout de `/contactos/nuevo` (header fijo, footer fijo, contenido scrollable), pero con el formulario de invoice a la izquierda y la vista previa A4 a la derecha.

### Cambios

**1. Crear `src/pages/finanzas/facturacion/NuevoInvoicePage.tsx`**

Estructura `main > header + content + footer` idéntica a `NuevoContactoForm`:

- **Header fijo** (`shrink-0 border-b`): Breadcrumb "Facturación > Nuevo Invoice", botón "Volver" con `ArrowLeft`, título "Nuevo Invoice" con icono `FileText`, subtítulo descriptivo.
- **Contenido** (`flex-1 overflow-auto`): Grid de dos columnas (`grid-cols-[400px_1fr]`). Columna izquierda: formulario (creador, monto, fee, metodo pago, fecha vencimiento, notas). Columna derecha: visor A4 con controles de zoom y el documento completo (header KASH, bill-to, tabla, footer).
- **Footer fijo** (`shrink-0 border-t`): Botones "Cancelar" (navega a `/finanzas/facturacion`) y "Crear Invoice".

Se reutiliza toda la logica de estado, query de creators, calculos de fee y el documento A4 del modal actual.

**2. Crear `src/pages/finanzas/facturacion/NuevoInvoice.tsx`**

Wrapper con `SidebarProvider + DashboardSidebar + DashboardTopbar + NuevoInvoicePage`, igual que `NuevoContacto.tsx`.

**3. Registrar ruta en `src/App.tsx`**

Agregar lazy import y ruta `/finanzas/facturacion/nuevo` envuelta en `PermissionRoute module="Finanzas"` y `FinanzasLayout`.

**4. Modificar `FacturacionPage.tsx`**

Cambiar el botón "Crear Invoice" de `onClick={() => setShowCreateModal(true)}` a `onClick={() => navigate("/finanzas/facturacion/nuevo")}`. Eliminar el estado `showCreateModal` y el render de `CrearInvoiceModal` si ya no se usa en ningún otro lugar.

