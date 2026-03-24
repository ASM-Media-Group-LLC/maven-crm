

## Plan: Fix conteo de leads por agente en tab Agentes

### Problema
`agentStats` se calcula a partir de `enrichedLeads`, que solo contiene los 100 leads de la página actual. Si hay 194 leads hoy, los agentes de la página 2 no se cuentan, y los conteos son incorrectos.

### Solución
Crear una query separada que traiga los conteos agrupados por agente directamente desde el servidor, sin depender de la paginación.

### Cambios

#### 1. `src/pages/leadgen/useLeadGen.ts` — nueva función `useLeadGenAgentStats`
- Nueva query que hace un `SELECT lg_user_id, quality, count(*)` agrupado, filtrando por `entry_date` y opcionalmente `lg_user_id`
- Como Supabase JS no soporta `GROUP BY`, la solución es hacer un select ligero de solo `lg_user_id, quality, created_at` **sin paginación** (sin `.range()`) usando `{ count: "exact", head: false }`
- En realidad, la forma más eficiente: hacer una query que traiga solo `lg_user_id` y `quality` de todos los leads del rango de fechas (sin limit), pero solo esas 2 columnas para minimizar payload
- Exportar como `useLeadGenAgentStats(dateFrom, dateTo)`

#### 2. `src/pages/leadgen/LeadGenContent.tsx` — usar la nueva query para agentStats
- Importar `useLeadGenAgentStats`
- Reemplazar el `useMemo` de `agentStats` (líneas 156-174) para que use los datos de la nueva query en lugar de `enrichedLeads`
- Esto asegura que el conteo por agente refleje TODOS los leads del rango de fechas, no solo la página actual

### Detalle técnico de la query

```typescript
// En useLeadGen.ts
export const useLeadGenAgentStats = (dateFrom?: string, dateTo?: string) =>
  useQuery({
    queryKey: ["leadgen-agent-stats", dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from("leadgen_entries")
        .select("lg_user_id, quality, created_at");
      if (dateFrom && dateTo) {
        q = q.gte("entry_date", dateFrom).lte("entry_date", dateTo);
      }
      // Fetch in batches of 1000 to bypass Supabase limit
      let all: any[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await q.range(page * 1000, (page + 1) * 1000 - 1);
        if (error) throw error;
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        page++;
      }
      // Aggregate by agent
      const byAgent: Record<string, { total: number; byQuality: Record<string, number>; firstLead: string }> = {};
      all.forEach(r => {
        if (!byAgent[r.lg_user_id]) byAgent[r.lg_user_id] = { total: 0, byQuality: {}, firstLead: r.created_at };
        byAgent[r.lg_user_id].total++;
        const q = r.quality?.toLowerCase() || "c";
        byAgent[r.lg_user_id].byQuality[q] = (byAgent[r.lg_user_id].byQuality[q] || 0) + 1;
      });
      return byAgent;
    },
  });
```

### Archivos
1. `src/pages/leadgen/useLeadGen.ts` — nueva query `useLeadGenAgentStats`
2. `src/pages/leadgen/LeadGenContent.tsx` — usar nueva query en `agentStats`

