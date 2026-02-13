
## Ajustar estilos del botón "No Promocionó"

### Cambio en `src/pages/promolog/PromologEntryCard.tsx`

Según la imagen de referencia, el botón "No Promocionó" cuando está seleccionado debe usar color azul/primary (como aparece en la captura), no púrpura como está actualmente.

### Detalle técnico

**Archivo:** `src/pages/promolog/PromologEntryCard.tsx` (línea 231)

**Cambio necesario:**
- Línea 231: Cambiar `bg-purple-500` por `bg-blue-500` (o `bg-primary` según el sistema de diseño)
- El botón "Sí Promocionó" (línea 220) se mantiene sin cambios con `bg-cyan-500`

**Comportamiento esperado:**
- "Sí Promocionó" seleccionado → fondo cyan/primary ✓ (sin cambios)
- "No Promocionó" seleccionado → fondo azul/blue-500 (cambio de púrpura a azul)
- Ambos botones no seleccionados → borde outline (sin cambios)
