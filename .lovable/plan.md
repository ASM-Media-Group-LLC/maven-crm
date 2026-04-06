

# Plan: Reducir ancho de buscador y agregar espacio antes del tab bar

## Cambio

En `TareasContent.tsx` línea 350-352, cambiar el `div` del input de `flex-1` a un ancho fijo más pequeño (e.g. `w-64`), y agregar separación visual (`gap-4` o un spacer) entre los filtros y el tab bar de vistas.

### Detalle

**Archivo**: `src/pages/tareas/TareasContent.tsx`

- Línea 350: Cambiar `className="relative flex-1"` → `className="relative w-64 shrink-0"`
- Línea 349: Cambiar `gap-3` → `gap-3` se mantiene entre filtros, pero el `Tabs` ya tiene `ml-auto` que crea espacio. Con el input más pequeño, el espacio visual aparece naturalmente.

Resultado: el buscador ocupa ~256px fijos en vez de expandirse, dejando espacio visible entre los filtros y las pestañas Kanban/Lista/Analíticas.

