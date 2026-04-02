

## Plan: Deduplicación + Identificador "AI Agent" + Limpiar columna Agente

### Cambios

**1. Restaurar deduplicación en `PromologContent.tsx`**
- Después del mapeo a `entries` (línea 227), agregar lógica de agrupamiento por clave compuesta: `creator_id` + fecha (día) + `network` + `platform` + `result`
- De cada grupo, seleccionar la entrada más completa (priorizar las que tienen `notes`, `reviewed_by`, agente humano)
- Usar las entries deduplicadas para KPIs, cards de redes/plataformas, y la tabla

**2. Deduplicar también en `usePromologAgentStats.ts`**
- Agregar `creator_id` y `date` al SELECT (línea 29)
- Aplicar la misma lógica de agrupamiento antes de contar métricas por agente

**3. Renombrar "Sync externo" → "AI Agent"**
- En `PromologContent.tsx` línea 221: cambiar fallback a `"AI Agent"`
- En `PromologTable.tsx` líneas 210-212: cambiar todas las referencias de `"Sync externo"` a `"AI Agent"`

**4. Limpiar columna Agente en `PromologTable.tsx`**
- Líneas 213-223: eliminar el botón `UserPlus` inline de la columna Agente
- Mostrar solo el badge "AI Agent" sin botón de asignar al lado
- La opción "Asignar agente" ya existe en el menú de acciones (MoreHorizontal) — se mantiene ahí

### Archivos a modificar
1. `src/pages/promolog/PromologContent.tsx` — deduplicación + renombrar a "AI Agent"
2. `src/pages/promolog/PromologTable.tsx` — renombrar badge + quitar botón UserPlus inline
3. `src/pages/promolog/usePromologAgentStats.ts` — deduplicar stats

