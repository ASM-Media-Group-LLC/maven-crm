

## Plan: Agentes dinámicos + Vista detalle + Acciones en Campañas

### Problema
1. `agentsData` está **hardcodeado** con solo Lorena (línea 99-101). No se calcula dinámicamente desde los datos reales de promolog_entries.
2. No existe vista de detalle al hacer clic en un agente (como sí existe en LeadGen con `AgentDetailView`).
3. La tabla de Campañas no tiene columna de acciones (editar, eliminar, ver detalle).

### Cambios

**1. Calcular `agentsData` dinámicamente desde `promologEntries` (`PromologContent.tsx`)**

Eliminar el array hardcodeado (líneas 99-101) y reemplazarlo con un `useMemo` que agrupe las entradas por `reviewed_by` (o `created_by` como fallback), usando `profilesMap` para resolver nombres. Para cada agente calculará:
- `id`: UUID del agente
- `name`: nombre completo desde profiles
- `tickets`: total de entradas
- `si` / `parcial` / `no`: conteos por resultado (promoted = "true"/"partial"/"false")
- `badges`: conteo por red social (IG, X, TikTok, etc.)

Filtrar por rango de fechas del agente (`agentDateFrom`/`agentDateTo`) si están activos.

**2. Crear `PromologAgentDetailView.tsx`** — Vista detalle del agente

Componente nuevo inspirado en el `AgentDetailView` de LeadGen pero adaptado a Promolog:
- Header con botón "Volver", nombre del agente, y KPI cards (Total entradas, Sí, Parcial, No, tasa de éxito)
- Auto-hide de KPIs al scroll (patrón ratchet estándar)
- Tabla con las entradas del agente usando las mismas columnas de PromologTable
- Filtros: búsqueda por modelo, red social, plataforma, rango de fechas
- Consulta propia al servidor (no depender de datos paginados del padre)

**3. Integrar navegación al detalle del agente (`PromologContent.tsx`)**

- Agregar estado `selectedAgent` con `{ id, name } | null`
- Si `selectedAgent` está activo, renderizar `PromologAgentDetailView` en lugar del contenido normal
- Hacer clickeable cada card/fila de agente para navegar al detalle
- Agregar botón `Eye` en la vista de lista

**4. Agregar columna de Acciones a la tabla de Campañas (`PromologContent.tsx`)**

En la tabla de campañas (línea ~940), agregar columna "Acciones" con:
- **Ver detalle** (Eye): abre modal con datos completos de la campaña
- **Editar** (Pencil): abre modal de edición (mes, objetivos, estado)
- **Eliminar** (Trash2): confirmación + delete de `promolog_campaigns`

Solo management (admin/manager/supervisor) ve editar y eliminar. Todos ven "Ver detalle".

### Archivos a modificar/crear

| Archivo | Acción |
|---------|--------|
| `src/pages/promolog/PromologContent.tsx` | Reemplazar agentsData hardcodeado por useMemo dinámico; agregar selectedAgent state + navegación; agregar acciones a campañas |
| `src/pages/promolog/PromologAgentDetailView.tsx` | **Crear** — Vista detalle del agente con KPIs, tabla de entradas, filtros |

### Detalles técnicos

**Cálculo dinámico de agentes:**
```tsx
const agentsData = useMemo(() => {
  const agentMap = new Map<string, { id: string; tickets: number; si: number; parcial: number; no: number; networks: Record<string, number> }>();
  
  for (const pe of promologEntries) {
    const agentId = pe.reviewed_by || pe.created_by;
    if (!agentId || !profilesMap[agentId]) continue;
    // filtrar por fechas si agentDateFrom/agentDateTo están activos
    
    let agent = agentMap.get(agentId);
    if (!agent) agent = { id: agentId, tickets: 0, si: 0, parcial: 0, no: 0, networks: {} };
    agent.tickets++;
    if (pe.promoted === "true") agent.si++;
    else if (pe.promoted === "partial") agent.parcial++;
    else agent.no++;
    const net = (pe.network || "otro").toUpperCase().slice(0, 2);
    agent.networks[net] = (agent.networks[net] || 0) + 1;
    agentMap.set(agentId, agent);
  }
  
  return Array.from(agentMap.entries()).map(([id, d]) => ({
    id, name: profilesMap[id], ...d,
    badges: Object.entries(d.networks).map(([label, value]) => ({ label, value }))
  }));
}, [promologEntries, profilesMap, agentDateFrom, agentDateTo]);
```

**PromologAgentDetailView** realizará su propia query:
```tsx
supabase.from("promolog_entries")
  .select("*, creators(name, artistic_name, instagram_handle)")
  .or(`reviewed_by.eq.${agentId},created_by.eq.${agentId}`)
  .order("date", { ascending: false })
```

