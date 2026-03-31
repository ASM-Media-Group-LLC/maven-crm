

## Plan: Estandarizar sección de Agentes en Promolog + Fix auto-hide en LeadGen AgentDetailView

### Problema
1. La sección "Agentes" en Promolog usa cards simples con badges de red social, pero no sigue el formato tabla que LeadGen tiene (Avatar + columnas Total, Sí, Parcial, No + Acciones).
2. El detalle del agente en Promolog (`PromologAgentDetailView`) solo muestra KPIs básicos y tabla de entradas, pero no tiene pestanas de Rendimiento (gráficos por día/hora) ni distribución por red social como LeadGen tiene.
3. En LeadGen `AgentDetailView`, el auto-hide de stats cards tiene `scrollTop < 10` que las re-expande (no es ratchet). Debe ser unidireccional como el resto de módulos.

### Cambios

**1. Promolog — Reformatear lista de agentes como tabla (`PromologContent.tsx`)**

Reemplazar el bloque de cards/grid de agentes (lineas ~887-937) por una tabla `DataTableShell` con estructura idéntica a LeadGen:
- Columnas: Agente (Avatar + nombre), Total (Badge), Sí, Parcial, No, Redes (badges IG/TK/X/TG), Acciones (Eye)
- Avatar con iniciales coloreadas como LeadGen
- Sticky headers y acciones fijas a la derecha
- Mantener vistas grid y calendar como alternativas

**2. Promolog — Enriquecer `PromologAgentDetailView.tsx`**

Agregar pestanas como LeadGen: "Promos" (tabla actual), "Rendimiento" (gráficos):

- **Header mejorado**: Breadcrumb (Promolog / Detalle Agente), tiempo activo hoy, contador última hora
- **Pestaña Rendimiento**:
  - Resumen del rango (Total Promos, Promedio/Día, Tasa de éxito %)
  - Gráfico de barras "Promos por Día" (últimos 7 días)
  - Gráfico de línea "Promos por Hora (Hoy)"
  - Distribución por Red Social (barras horizontales)
  - Distribución por Resultado (Sí/Parcial/No)
- Usar recharts como LeadGen

**3. LeadGen — Fix ratchet en `AgentDetailView.tsx`**

Cambiar linea 80:
```tsx
// ANTES:
else if (scrollTop < 10) setStatsCollapsed(false);
// DESPUÉS: eliminar esta línea (ratchet unidireccional)
```

El reset solo ocurre al cambiar de tab o filtros.

**4. Actualizar memoria del design system**

Documentar que el auto-hide SIEMPRE debe ser ratchet unidireccional (solo colapsa, nunca re-expande por scroll) para evitar jitter. Reset solo por cambio de tab/filtro.

### Archivos a modificar

| Archivo | Acción |
|---------|--------|
| `src/pages/promolog/PromologContent.tsx` | Reemplazar cards de agentes por tabla estilo LeadGen |
| `src/pages/promolog/PromologAgentDetailView.tsx` | Agregar tabs (Promos + Rendimiento), header enriquecido, gráficos recharts |
| `src/pages/leadgen/AgentDetailView.tsx` | Eliminar re-expand en scroll (línea 80) |

### Detalle técnico

**Tabla de agentes Promolog** (reemplaza el bloque de cards):
```tsx
<DataTableShell currentPage={agentPage} totalPages={...} totalCount={agentsData.length} pageSize={50} onPageChange={setAgentPage}>
  <Table className="min-w-[700px]">
    <TableHeader>
      <TableRow>
        <TableHead sticky>Agente</TableHead>
        <TableHead sticky center>Total</TableHead>
        <TableHead sticky center>Sí</TableHead>
        <TableHead sticky center>Parcial</TableHead>
        <TableHead sticky center>No</TableHead>
        <TableHead sticky center>Redes</TableHead>
        <TableHead sticky right>Acciones</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {agentsData.map(agent => (
        <TableRow clickable onClick={...}>
          <TableCell><Avatar>{initials}</Avatar> {name}</TableCell>
          <TableCell><Badge>{agent.tickets}</Badge></TableCell>
          <TableCell className="text-success">{agent.si}</TableCell>
          <TableCell className="text-warning">{agent.parcial}</TableCell>
          <TableCell className="text-destructive">{agent.no}</TableCell>
          <TableCell>{badges}</TableCell>
          <TableCell><Eye button/></TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</DataTableShell>
```

**AgentDetailView Promolog — Tabs + Rendimiento:**
```tsx
const tabs = [
  { id: "promos", label: "Promos" },
  { id: "rendimiento", label: "Rendimiento" },
];

// Tab Rendimiento:
// - Resumen: Total promos, Promedio/día, Tasa éxito
// - BarChart: Promos por día (7 días)
// - LineChart: Promos por hora (hoy)
// - BarChart horizontal: Distribución por red social
// - BarChart horizontal: Distribución por resultado
```

**LeadGen fix (1 línea):**
```tsx
const handleContentScroll = (e: React.UIEvent<HTMLDivElement>) => {
  if (e.currentTarget.scrollTop > 40) setStatsCollapsed(true);
};
```

