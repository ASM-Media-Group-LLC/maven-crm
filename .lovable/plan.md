

## Plan: Corregir sincronización de datos en AgentDetailView

### Problema raíz
`AgentDetailView` recibe los leads como prop desde `LeadGenContent` (línea 190):
```
leads={enrichedLeads.filter(l => l.lg_user_id === selectedAgent.id)}
```
Pero `enrichedLeads` es solo la **página actual** de la consulta paginada (100 registros máximo). Si el agente tiene 500 leads, solo se ven los que caen en la página actual del listado principal. Todas las métricas (KPIs, quality counts, charts, "Total Hoy", "Promedio por Hora") están calculadas sobre datos incompletos.

Ya existe el hook `useLeadGenAgentLeads` que hace fetch de **todos** los leads del agente sin límite de paginación, pero no se usa en AgentDetailView.

Además, el filtro fallback por `company` (línea 79) es incorrecto — mezcla leads de otros agentes que casualmente comparten nombre de empresa.

### Cambios en `AgentDetailView.tsx`

#### 1. Usar `useLeadGenAgentLeads` en lugar de prop `leads`
- Importar `useLeadGenAgentLeads` desde `useLeadGen`
- Llamar al hook con `agent.id` y el rango de fechas seleccionado
- Eliminar la prop `leads` del componente (o hacerla opcional/ignorarla)
- Actualizar `AgentDetailViewProps` para no requerir `leads`

#### 2. Eliminar filtro fallback por `company`
- Quitar la línea 79 (`l.company?.toLowerCase() === agent.name.toLowerCase()`)
- El hook ya filtra por `lg_user_id` en el servidor

#### 3. Ajustar `LeadGenContent.tsx` línea 186-193
- Dejar de pasar `leads` como prop (o pasar array vacío para compatibilidad)
- Pasar `dateFrom`/`dateTo` strings al componente para que el hook funcione correctamente

### Resultado
- Las métricas reflejan **todos** los leads del agente, no solo los de la página actual
- KPIs, quality cards, charts y tabla muestran datos correctos y sincronizados con la DB
- Sin cambios en la DB, solo corrección del flujo de datos en el frontend

### Archivos a modificar
- `src/pages/leadgen/AgentDetailView.tsx` — usar hook propio, quitar dependencia de prop leads
- `src/pages/leadgen/LeadGenContent.tsx` — actualizar props pasadas a AgentDetailView

