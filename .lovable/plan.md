

## Plan: Preview en tiempo real tipo PDF dentro del modal "Crear Invoice"

### Resumen

Reorganizar el modal `CrearInvoiceModal` a dos columnas: formulario a la izquierda, preview tipo hoja A4 a la derecha que se actualiza en tiempo real con los datos del formulario.

### Cambios en un solo archivo

**`src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`**

1. **Ampliar el modal** — Cambiar `max-w-lg` a `max-w-5xl` para acomodar dos columnas.

2. **Layout de dos columnas** — Dividir el contenido en `grid grid-cols-[1fr_1fr]` (o `grid-cols-[420px_1fr]`):
   - **Columna izquierda**: El formulario actual completo (campos + botones), con scroll vertical si es necesario (`overflow-y-auto max-h-[75vh]`).
   - **Columna derecha**: El preview del invoice.

3. **Componente InvoicePreview (inline)** — Renderizar dentro del mismo archivo un div con aspecto de hoja A4:
   - Contenedor con `aspect-[210/297]` (proporciones A4), fondo blanco, sombra, bordes suaves, escalado con `transform scale` para caber en el espacio disponible.
   - **Encabezado**: Logo "Maven CRM" en la esquina superior izquierda, número de invoice placeholder (ej. "INV-XXXX"), fecha actual.
   - **Datos del creador**: Nombre del creador seleccionado (tomado del array `creators`).
   - **Tabla de detalle**: Concepto, monto, fee, neto — con líneas divisorias simuladas con bordes CSS.
   - **Método de pago y fecha de vencimiento**.
   - **Notas** si existen.
   - **Footer**: Disclaimer y fecha de generación.
   - Todo el contenido reactivo a las variables de estado existentes (`amt`, `feeAmount`, `netAmount`, `paymentMethod`, `dueDate`, `notes`, `creatorId`).

4. **Eliminar el bloque "Preview del Cálculo"** actual (líneas 121-126) ya que el preview visual lo reemplaza.

5. **Mover los botones del footer** debajo de la columna izquierda (dentro del formulario) para mantener la acción cerca de los campos.

### Detalles técnicos del preview

- Tipografía: `font-serif` para simular aspecto de documento impreso, tamaños pequeños (`text-[10px]`, `text-[11px]`) dentro del contenedor escalado.
- El preview se envuelve en un contenedor con `bg-muted/20 rounded-lg p-4` y un label "Vista previa" encima.
- La hoja A4 se centra verticalmente con `flex items-center justify-center`.
- Se usa `overflow-hidden` para evitar desborde visual.

### Sin cambios en

- Lógica de `onSubmit`, query de creators, cálculos de fees, ni estructura de datos enviados.
- No se crea archivo ni componente nuevo.

