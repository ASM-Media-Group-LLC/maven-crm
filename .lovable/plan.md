

# Plan: Arreglar "agentes activos" y rendimiento lento en Promolog

## Problemas encontrados

### 1. Solo muestra Lorena como agente activo
La DB tiene 4 agentes con perfil y entradas: Lorena (292), Fabiana (20), Carolina (17) y Closer testerJP (1). Sin embargo, el hook `usePromologAgentStats` descarga las 34,000 entradas al cliente y aplica una lógica de deduplicación por `creator_id + día + red + promoted`. Cuando dos agentes distintos revisaron al mismo creador el mismo día en la misma red, **solo sobrevive una entrada**, eliminando al otro agente. Esto hace que Fabiana y Carolina pierdan sus entradas y no aparezcan.

### 2. El selector de agente tarda mucho
El hook descarga 34K filas en lotes secuenciales de 1000 (34+ requests HTTP) antes de poder mostrar la lista de agentes. Esto causa una espera de varios segundos.

## Solución: Reemplazar con queries server-side eficientes

### A. Hook `usePromologAgentStats` — reescribir completamente

**Lista de agentes activos**: En vez de descargar todo, hacer una query ligera:
```sql
SELECT DISTINCT COALESCE(reviewed_by, created_by) as agent_id 
FROM promolog_entries 
WHERE reviewed_by IS NOT NULL OR created_by IS NOT NULL
```
Luego cruzar con `profileIds` en el cliente. Esto reemplaza 34+ requests con 1 sola query.

**Stats por agente**: Calcular stats (total/si/parcial/no/redes) solo cuando se selecciona un agente específico, filtrando en el servidor con `.or(reviewed_by.eq.X, created_by.eq.X)`. No se necesita descargar todo.

### B. Hook `usePromologAgentEntries` — mantener pero optimizar
Ya filtra por agente (correcto). Mantener sin cambios.

### C. `PromologPerformanceView.tsx` — adaptar al nuevo hook
- La lista de agentes vendrá de un query ligero (instant load)
- Las stats se calculan en el cliente solo con las entradas del agente seleccionado (ya disponibles via `usePromologAgentEntries`)
- Eliminar dependencia de `usePromologAgentStats` para la lista de agentes

### D. Eliminar deduplicación incorrecta
La lógica de dedup que colapsa entradas de distintos agentes se elimina. Si hay duplicados legítimos, se manejarán con otra estrategia que no borre la atribución del agente.

## Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `usePromologAgentStats.ts` | Reescribir: query ligera para agentes activos, stats bajo demanda por agente |
| `PromologPerformanceView.tsx` | Adaptar a los nuevos hooks; calcular stats desde entries del agente seleccionado |

## Resultado esperado
- Los 4 agentes aparecen en la lista (no solo Lorena)
- El selector carga instantáneamente (1 query vs 34+)
- Los gráficos cargan solo al seleccionar un agente

