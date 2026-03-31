

## Plan: Añadir pestaña "Rendimiento" en /promolog (estilo LeadGen)

### Problema
No existe una vista de rendimiento global en Promolog donde se pueda seleccionar un agente y ver sus gráficos de actividad (por hora, día, semana, mes). Además, los agentes/closers no pueden ver su propio rendimiento.

### Cambios

**1. Añadir tab "Rendimiento" a PromologContent.tsx**

Agregar un cuarto tab al array `tabItems`:
```tsx
{ id: "rendimiento" as const, label: "Rendimiento", icon: BarChart3 }
```

Actualizar el tipo de `activeTab` para incluir `"rendimiento"`.

**2. Crear componente `PromologPerformanceView.tsx`**

Replicar la estructura exacta de `LeadGenPerformanceView.tsx` adaptada a promolog:

- **Selector de agente**: Combobox (Popover + Command) para elegir un agente
- **Para roles operativos** (agent/closer/employee): auto-seleccionar su propio ID y ocultar el selector
- **Para management**: mostrar todos los agentes que tienen entradas en promolog
- **Datos**: Query directa a `promolog_entries` filtrada por `reviewed_by` o `created_by` del agente seleccionado
- **Gráficos** (4 charts con Recharts, idénticos al formato LeadGen):
  1. Promos por Hora del Día (BarChart, hoy)
  2. Promos por Día — Última Semana (BarChart, 7 días)
  3. Promos por Día — Últimos 30 días (LineChart)
  4. Promos por Mes — Últimos 12 meses (BarChart)
- **Header card**: Total de Promos del agente con gradiente primary
- **Distribución adicional por resultado** (Sí/Parcial/No) como barras horizontales

**3. Auto-selección para agentes/closers**

En `PromologContent.tsx`, pasar `user.id` y `role` al componente. Si el rol es agent/closer/employee, el componente fija `selectedAgent = user.id` automáticamente y no muestra el selector.

### Archivos

| Archivo | Acción |
|---------|--------|
| `src/pages/promolog/PromologPerformanceView.tsx` | **Crear** — Vista de rendimiento con selector + 4 gráficos |
| `src/pages/promolog/PromologContent.tsx` | Agregar tab "Rendimiento", renderizar el nuevo componente |

### Detalle técnico

**Query de datos del agente:**
```tsx
const { data } = useQuery({
  queryKey: ["promolog-agent-performance", agentId],
  queryFn: async () => {
    const { data } = await supabase
      .from("promolog_entries")
      .select("id, date, promoted, network, created_at")
      .or(`reviewed_by.eq.${agentId},created_by.eq.${agentId}`)
      .order("date", { ascending: false });
    return data ?? [];
  },
  enabled: !!agentId,
});
```

**Lógica de auto-selección:**
```tsx
// Si es agent/closer, auto-seleccionar y ocultar combobox
const isOperational = isAgent || isCloser || isEmployee;
const effectiveAgent = isOperational ? userId : selectedAgent;
```

