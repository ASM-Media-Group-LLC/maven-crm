

## Plan: Mostrar agente correctamente en Promolog

### Problema identificado
- El código actual solo revisa `reviewed_by` para mostrar el nombre del agente
- No usa `created_by` como respaldo
- 87% de las entradas (27,793 de 31,989) no tienen ni `reviewed_by` ni `created_by` — son importaciones externas sin agente asignado

### Datos actuales
| Campo | Entradas con valor |
|---|---|
| `reviewed_by` | 4,196 |
| `created_by` | 130 |
| Sin agente | 27,793 |

### Cambios

**1. Fallback a `created_by` en la resolución de agente**
- **Archivo**: `src/pages/promolog/PromologContent.tsx` (línea 243)
- Cambiar de: `agent: (pe.reviewed_by && profilesMap[pe.reviewed_by]) || "—"`
- A: `agent: (pe.reviewed_by && profilesMap[pe.reviewed_by]) || (pe.created_by && profilesMap[pe.created_by]) || "Sin asignar"`
- Esto corrige las 130 entradas que tienen `created_by` pero no `reviewed_by`

**2. Mejorar indicador visual de "Sin asignar"**
- En la tabla y cards, mostrar "Sin asignar" con un estilo sutil (texto gris/itálica) en lugar de "—"
- Facilita identificar visualmente qué promos necesitan asignación

**3. Consistencia en stats de agentes**
- El hook `usePromologAgentStats.ts` ya usa `entry.reviewed_by || entry.created_by` (línea 45), así que las estadísticas ya contemplan ambos campos — solo falta alinear la UI

### Alcance
- Solo cambios frontend (1-2 archivos)
- No requiere migraciones de base de datos

