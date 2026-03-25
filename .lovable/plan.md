

## Plan: Reestructurar modal a patrón header/content/footer unificado

### Cambios en `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`

Reorganizar el `DialogContent` de un grid de dos columnas de borde a borde a un layout vertical con 3 zonas:

**1. Header (shrink-0, border-b, px-6 py-4)**
- `DialogHeader` con `DialogTitle` "Crear Invoice" alineado a la izquierda
- El botón X ya lo provee `DialogContent` automáticamente

**2. Content (flex-1, overflow-y-auto, p-6)**
- Grid interno `grid-cols-[400px_1fr] gap-6`
- **Columna izquierda**: Campos del formulario (sin botones de acción, sin DialogHeader)
- **Columna derecha**: Bloque contenido de preview con `bg-muted/40 rounded-xl border` y padding interno. Dentro:
  - Mini-header propio: "Vista previa" a la izquierda + controles de zoom a la derecha
  - Área scrollable con el documento A4 centrado (misma lógica de zoom actual)

**3. Footer (shrink-0, border-t, px-6 py-4)**
- Botones "Cancelar" y "Crear Invoice" alineados a la derecha con `flex justify-end gap-2`

### Estructura visual

```text
┌──────────────────────────────────────┐
│ Crear Invoice                      X │  ← header
├──────────────────────────────────────┤
│  Form fields   │  ┌──────────────┐  │
│  Creador       │  │Vista prev [±]│  │
│  Monto         │  │ ┌──────────┐ │  │
│  Fee / Método  │  │ │  A4 doc  │ │  │
│  Fecha         │  │ └──────────┘ │  │
│  Notas         │  └──────────────┘  │  ← content
├──────────────────────────────────────┤
│                 Cancelar   Crear Inv │  ← footer
└──────────────────────────────────────┘
```

### Detalles clave

- `DialogContent`: `max-w-5xl p-0 gap-0 flex flex-col max-h-[85vh]`
- El preview block es un `div` redondeado con padding generoso, NO una columna completa de borde a borde — se siente como un componente independiente dentro del espacio
- El `viewerRef` se mueve al bloque de preview contenido
- Contenido del documento A4, lógica de zoom y cálculos de fee no cambian
- Se elimina el `DialogHeader` de la columna izquierda y se mueve al header global
- Se eliminan los botones de la columna izquierda y se mueven al footer global

