

## Plan: Corregir funcionalidad y vista en AgentDetailView

### Problemas identificados

1. **Acciones sin funcionalidad**: `LeadGenTable` recibe `onView` prop pero `AgentDetailView` no la pasa — el botón Eye no hace nada
2. **QA tab vacío**: Solo muestra placeholder "no disponible aún" (línea 459-465)
3. **Stats no se ocultan en tab Rendimiento**: El tab "rendimiento" usa su propio `overflow-auto` (línea 372), independiente del `DataTableShell`, así que el `handleContentScroll` nunca se dispara
4. **Quality cards con estilo inconsistente**: En el screenshot se ven las cards A+/A/B+/B/C con gradientes oscuros (verde-azul-púrpura) — esto no coincide con el design system estándar de `Card`/`CardContent` con badge + hover sutil

### Cambios

#### 1. Acciones funcionales (`AgentDetailView.tsx`)
- Agregar estado `selectedLead` para mostrar un modal/panel de detalle al hacer click en Eye
- Pasar `onView={(lead) => setSelectedLead(lead)}` al `LeadGenTable`
- Renderizar un Dialog con los datos del lead seleccionado (handle, categoría, teléfono, notas, fecha, país)

#### 2. Tab QA — implementación básica (`AgentDetailView.tsx`)
- Reemplazar el placeholder por una tabla simple con los leads del agente que tienen `quality` asignada
- Mostrar: Handle, Categoría actual, Fecha, un campo de notas/retroalimentación inline (editable)
- Usar `DataTableShell` con `onScroll={handleContentScroll}` para consistencia y auto-hide

#### 3. Auto-hide en tab Rendimiento (`AgentDetailView.tsx`)
- Cambiar el div `overflow-auto` del tab rendimiento (línea 372) por un `DataTableShell`-like scroll container
- Agregar `onScroll={handleContentScroll}` al div scrollable para que las stats se oculten al hacer scroll en los charts también

#### 4. Quality cards estandarizadas (ya corregidas)
- Las quality cards en `AgentDetailView` ya usan el estilo correcto (`Card`/`CardContent` con hover sutil) — confirmar que el screenshot de la imagen corresponde al estado actual o a un estado anterior con gradientes oscuros. Si persisten los gradientes, reemplazarlos por el estilo de `qualityCardConfig` actual (líneas 23-29)

### Archivos a modificar
- `src/pages/leadgen/AgentDetailView.tsx` — todas las correcciones

