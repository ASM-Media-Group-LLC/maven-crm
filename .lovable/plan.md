

## Plan: Corregir stats cards y rendimiento de agente en LeadGen

### Problemas identificados

1. **Stats cards muestran datos incorrectos**: `LeadGenCantidadCard` y `LeadGenEstadosCard` reciben `enrichedLeads` que es solo la página actual (máx 100 registros), no todos los leads del rango. Los conteos son incorrectos cuando hay más de 100 leads.

2. **Performance view (Rendimiento)**: Al seleccionar un agente, los gráficos usan `leads` (página actual, 100 registros) en vez de todos los leads del agente. Los datos de horas, días y meses están incompletos.

3. **Layout**: La card de "Estados" ocupa espacio innecesario.

### Cambios

#### 1. Nuevo hook `useLeadGenSummaryStats` en `useLeadGen.ts`
Consulta ligera que trae conteos agregados de **todos** los leads (sin límite de paginación) para el rango de fechas:
- Por quality (a+, a, b+, b, c)
- Total
- Con teléfono (QA)

Usa la misma estrategia de paginación interna que `useLeadGenAgentStats` (batches de 1000) pero solo trae `quality, phone_raw, phone_e164, status`.

#### 2. Eliminar `LeadGenEstadosCard`
- Quitar el import y el componente del grid en `LeadGenContent.tsx`
- No eliminar el archivo por ahora (por si se necesita después)

#### 3. Cambiar layout de stats cards en `LeadGenContent.tsx`
- Cambiar `grid grid-cols-2` → ancho completo para `LeadGenCantidadCard`
- La card de Cantidad ocupa toda la línea

#### 4. Actualizar `LeadGenCantidadCard`
- Recibir los conteos pre-calculados del nuevo hook en vez de calcularlos localmente desde `leads[]`
- Props cambian de `leads: LeadGenEntry[]` a `stats: { total, qa, byQuality }` + las props de filtro existentes

#### 5. Corregir `LeadGenPerformanceView`
- El componente recibe `leads` (solo página actual). Cambiar para que haga su propia consulta de **todos** los leads del agente seleccionado (sin paginación), usando una nueva función `fetchAllAgentLeads(agentId, dateFrom, dateTo)` en el hook.
- Alternativamente, reusar el patrón de `useLeadGenAgentStats` que ya trae todos los leads en batches, y extenderlo para incluir `created_at` y `entry_date` necesarios para los gráficos.

### Archivos a modificar
- `src/pages/leadgen/useLeadGen.ts` — nuevo hook `useLeadGenSummaryStats` + hook para leads completos de un agente
- `src/pages/leadgen/LeadGenContent.tsx` — quitar EstadosCard, layout full-width, pasar stats al CantidadCard, pasar dateRange al PerformanceView
- `src/pages/leadgen/LeadGenCantidadCard.tsx` — recibir stats pre-calculados en vez de array de leads
- `src/pages/leadgen/LeadGenPerformanceView.tsx` — fetch propio de todos los leads del agente seleccionado

