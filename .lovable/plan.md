

## Plan: Unificar estilo de tablas en Agentes y Detalle de Agente

### Problemas identificados

1. **Tabla de agentes (tab "Agentes" en LeadGenContent)**: Tiene un estilo diferente — header con gradiente, sin columna de Acciones, sin sticky headers, sin `SortHeader`.

2. **Tabla de leads en AgentDetailView**: Handle muestra `@Ver` en vez del handle real con link. Categoría usa un badge estático en vez del `QualityCell` inline editable. La columna Acciones tiene un select de categoría duplicado (ya está en la columna Categoría). No usa el componente `LeadGenTable` estándar.

### Cambios

#### 1. Tabla de agentes en `LeadGenContent.tsx` (líneas 422-467)
- Agregar columna **Acciones** con botón "Ver detalle" (Eye icon)
- Aplicar sticky headers con el mismo patrón del `LeadGenTable`
- Agregar `SortHeader` en columnas (Agente, Total, A+, A, B+, B, C)
- Eliminar el header con gradiente decorativo (líneas 363-383) — usar estilo neutro consistente

#### 2. Tabla de leads en `AgentDetailView.tsx` (líneas 278-349)
- Reemplazar la tabla manual por el componente `LeadGenTable` reutilizado, que ya tiene:
  - Handle con `@model_handle` + link externo
  - `QualityCell` inline editable
  - Columna de Acciones con botón Eye
  - Sticky headers y `SortHeader`
- Pasar `profiles` como prop para mantener la funcionalidad de reasignación
- Eliminar el select de categoría duplicado en Acciones

### Archivos a modificar
- `src/pages/leadgen/LeadGenContent.tsx` — tabla de agentes: agregar Acciones, sticky headers, sort
- `src/pages/leadgen/AgentDetailView.tsx` — reemplazar tabla manual por `LeadGenTable`

