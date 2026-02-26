

## Plan: Mejoras al Dashboard Principal

### Problemas identificados

1. **Datos falsos hardcodeados**: El gráfico "Rendimiento Semanal" usa `weeklyData` y `dealsWeekly` estáticos (líneas 85-103) — nunca consulta la DB. "Promotion Compliance" está fijo en "39%". La tarjeta "Scripts and Tools" muestra "--" en todo. "Closers > En llamada" muestra "--".

2. **Header no sigue el estándar**: Usa `text-2xl font-bold` en vez de `text-xl font-semibold`. Los botones "Actualizar" y "Exportar" no hacen nada (sin onClick handler funcional).

3. **Sin adaptación por rol**: El dashboard muestra lo mismo para admin, manager, agent, closer y supervisor. Un closer no necesita ver pipeline de leads; un agente no necesita ver deals.

4. **Sin datos de HR ni Finanzas**: El dashboard no refleja dos módulos completos de la plataforma — no hay KPIs de empleados, ausencias, nómina, ni ingresos totales de la empresa.

5. **Sin datos de Tareas/Eventos pendientes**: No muestra tareas próximas a vencer ni eventos del día, que son módulos activos de la plataforma.

6. **La tarjeta "Actividad Reciente" solo muestra tickets**: Debería ser un feed multi-fuente (tickets + tareas + eventos + cambios de rol).

7. **No usa el layout estándar `h-screen overflow-hidden`**: Usa `flex-1 overflow-auto` directamente sin el wrapper de pantalla completa del `Dashboard.tsx`.

### Cambios propuestos

| # | Cambio | Detalle |
|---|--------|---------|
| 1 | **Eliminar datos fake** | Reemplazar `weeklyData`/`dealsWeekly` por queries reales a `leads` y `deals` agrupados por día de la semana actual. Calcular compliance real desde `eventos` o eliminar si no hay fuente |
| 2 | **Fix header** | `text-xl font-semibold`, botón Actualizar con `queryClient.invalidateQueries()`, eliminar botón Exportar (no tiene sentido en dashboard) |
| 3 | **Agregar KPIs de HR y Finanzas** | Nueva fila de KPIs: Total Empleados (desde `employees`), Ausencias Hoy (desde `absences`), Tareas Vencidas (desde `tasks`), Eventos Hoy (desde `events`) |
| 4 | **Actividad Reciente multi-fuente** | Fusionar últimos tickets, tareas completadas y eventos recientes en un timeline unificado ordenado por fecha, con iconos diferenciados por tipo |
| 5 | **Gráfico semanal con datos reales** | Query de `leads` y `deals` de la semana actual agrupados por `day_of_week(created_at)` |
| 6 | **Reemplazar tarjeta "Scripts and Tools"** | No tiene datos reales. Sustituir por "Tareas Pendientes" o "Eventos Próximos" con datos de `tasks`/`events` |
| 7 | **Dashboard adaptativo por rol** | Usar `usePermissions` para mostrar solo las secciones a las que el usuario tiene acceso. Si no tiene acceso a LeadGen, ocultar pipeline y leads KPI |

### Detalle técnico

**Datos reales para gráfico semanal**:
```typescript
const useWeeklyStats = () => useQuery({
  queryKey: ["dashboard-weekly"],
  queryFn: async () => {
    const startOfWeek = // lunes de esta semana
    const { data: leads } = await supabase
      .from("leads")
      .select("created_at")
      .gte("created_at", startOfWeek.toISOString());
    const { data: deals } = await supabase
      .from("deals")
      .select("created_at")
      .gte("created_at", startOfWeek.toISOString());
    // Agrupar por día → [{day: "Lun", leads: 5, deals: 2}, ...]
  },
});
```

**KPIs adicionales (HR + Tareas + Eventos)**:
```typescript
const useOperationalKPIs = () => useQuery({
  queryKey: ["dashboard-operational"],
  queryFn: async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [employees, absences, overdueTasks, todayEvents] = await Promise.all([
      supabase.from("employees").select("id", { count: "exact", head: true }),
      supabase.from("absences").select("id", { count: "exact", head: true })
        .eq("date", today),
      supabase.from("tasks").select("id", { count: "exact", head: true })
        .lt("due_date", today).neq("status", "done"),
      supabase.from("events").select("id", { count: "exact", head: true })
        .eq("event_date", today),
    ]);
    return { employees, absences, overdueTasks, todayEvents };
  },
});
```

**Actividad reciente multi-fuente**:
```typescript
// Merge tickets + tareas + eventos recientes
const recentActivity = [
  ...tickets.map(t => ({ type: 'ticket', title: t.title, date: t.created_at, icon: Ticket })),
  ...tasks.map(t => ({ type: 'task', title: t.title, date: t.updated_at, icon: CheckSquare })),
  ...events.map(e => ({ type: 'event', title: e.name, date: e.created_at, icon: Calendar })),
].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
```

**Dashboard adaptativo**:
```typescript
const { canAccess } = usePermissions();
// Solo mostrar secciones según permisos
{canAccess("leadgen") && <PipelineCard />}
{canAccess("closers") && <ClosersCard />}
{canAccess("hr") && <HRKPIs />}
```

### Orden de implementación

1. Fix header (estándar + botón Actualizar funcional)
2. Reemplazar datos fake por queries reales (leads/deals semanales)
3. Agregar KPIs operacionales (empleados, ausencias, tareas vencidas, eventos hoy)
4. Actividad reciente multi-fuente
5. Reemplazar "Scripts and Tools" por "Tareas Pendientes"
6. Integrar `usePermissions` para secciones adaptativas por rol

### Impacto

- Dashboard pasa de ser 40% datos fake a 100% datos reales
- Refleja toda la plataforma (HR, Finanzas, Tareas, Eventos) en vez de solo Sales + Tickets
- Se adapta al rol del usuario mostrando solo lo relevante
- Header y layout siguen el estándar de la plataforma

