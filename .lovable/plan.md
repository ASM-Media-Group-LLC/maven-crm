

## Plan: Ocultar agentes huérfanos y añadir opción de vincular leads a un agente

### Problema
Los `agentStats` incluyen agentes cuyo `lg_user_id` no tiene perfil en la tabla `profiles`, mostrando "Agente" genérico en la tabla de rendimiento y en el dropdown de PerformanceView. Esto genera confusión con datos de prueba/legacy.

### Cambios

#### 1. Filtrar agentes huérfanos en `LeadGenContent.tsx` (línea ~160-168)
En el `useMemo` que construye `agentStats`, filtrar solo agentes que existen en `profilesMap`:
```ts
// Antes del .sort(), agregar:
.filter(agent => !!profilesMap[agent.id])
```
Esto oculta de las tabs "Agentes", "Rendimiento" y "Supervisores" cualquier ID sin perfil real.

#### 2. También filtrar en la tabla de leads (línea ~87)
En `enrichedLeads`, los leads huérfanos seguirán apareciendo con `agent_name: "—"` — esto está bien, no se ocultan los leads, solo los agentes fantasma de las vistas de rendimiento.

#### 3. Añadir opción de reasignar agente en leads huérfanos
En `LeadGenTable.tsx` (o equivalente), para leads cuyo `lg_user_id` no existe en `profilesMap`, mostrar un dropdown/botón en la columna "Agente" que permita seleccionar un agente real y actualizar el `lg_user_id` del lead usando `useUpdateLeadField`.

### Archivos a modificar
- `src/pages/leadgen/LeadGenContent.tsx` — filtrar agentes huérfanos del array `agentStats`
- `src/pages/leadgen/LeadGenTable.tsx` — añadir opción de reasignar agente para leads sin perfil válido

