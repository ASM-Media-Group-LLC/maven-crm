

## Plan: Visor de PDF profesional con zoom en el preview del Invoice

### Resumen

Convertir el panel derecho del modal en un visor de documentos profesional con zoom controlable, donde la hoja A4 escale dinámicamente y permita scroll cuando excede el viewport.

### Cambios en `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`

1. **Nuevo estado `zoom`** — `useState(0.65)` (valor por defecto que garantiza que la hoja A4 completa sea visible sin recortes).

2. **Controles de zoom flotantes** — Barra sticky/fixed dentro del panel derecho (parte superior o inferior) con botones para niveles predefinidos (80%, 100%, 120%, 150%) o botones +/- con paso de 10%. Usar `z-10` y fondo semi-transparente con blur para que floten sobre el contenido al hacer scroll.

3. **Reestructurar el contenedor del preview**:
   - El panel derecho pasa a ser `relative` con `overflow-y-auto` (scrollable).
   - Dentro, un contenedor centrado (`flex items-start justify-center py-8 min-h-full`).
   - La hoja A4 tiene dimensiones fijas en px (ej. `595px x 842px`, las dimensiones reales de A4 a 72dpi) y se escala con `transform: scale(zoom)` + `transform-origin: top center`.
   - Cuando zoom > fit, el contenedor se agranda y aparece scroll natural.

4. **Cálculo de fit automático** — Al montar o cambiar tamaño, calcular el scale que hace que 842px de alto quepa en el espacio disponible. Usar ese valor como zoom por defecto. Opcionalmente un botón "Ajustar" que vuelva al fit.

5. **Visual** — Fondo `bg-gray-100` (gris suave tipo visor), la hoja con `shadow-xl` y bordes definidos para simular hoja flotante. Los controles de zoom con `backdrop-blur-sm bg-background/80 rounded-lg border shadow-sm`.

6. **Sin cambios** en la columna izquierda (formulario), lógica de submit, ni contenido del documento A4.

### Estructura resultante del panel derecho

```text
┌─────────────────────────────┐
│ [Vista previa]   [-][80%][+]│  ← sticky toolbar
│─────────────────────────────│
│                             │
│     ┌───────────────┐       │  ← scrollable area
│     │               │       │
│     │   A4 Sheet    │       │
│     │  595 x 842px  │       │
│     │  scale(zoom)  │       │
│     │               │       │
│     └───────────────┘       │
│                             │
└─────────────────────────────┘
```

