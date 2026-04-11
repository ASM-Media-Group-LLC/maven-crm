

# Plan: Fix Analytics Duplicates + Global Analytics

## Problems Found

### Per-project analytics (TaskAnalyticsTab.tsx)
The KPI stats cards (Total, Completadas, Vencidas, Progreso) are rendered TWICE:
- Once in `TareasContent.tsx` (lines 405-436) — always visible regardless of tab
- Again inside `TaskAnalyticsTab.tsx` (lines 174-211)

Additionally, there are TWO Gantt/timeline visualizations rendering the same data:
- Full Gantt chart (`ganttChartData`, lines 256-293)
- Simplified timeline (`ganttData`, lines 317-340)

### Global analytics (GlobalAnalyticsTab.tsx)
The `allTasks` query in `useProjects.ts` (line 104-115) uses `as any` casting on the `tasks` table. If RLS blocks the query, the error is swallowed and returns an empty array, showing "No hay tareas para analizar." The component itself is correct — the issue is the data source.

---

## Changes

### 1. TaskAnalyticsTab.tsx — Remove duplicate content
- Remove the KPI cards section (lines 174-211) since TareasContent already displays them
- Remove the duplicate simplified timeline section (`ganttData` variable + its render block, lines 143-159 and 317-340)
- Keep: status pie, priority bars, full Gantt chart, workload chart, overdue list

### 2. GlobalAnalyticsTab.tsx — Fix data loading + error handling
- Add error state handling: catch and display errors from the `allTasks` query
- Add a console.log or debug indicator when `tasks` array is empty despite `isLoading=false`

### 3. useProjects.ts — Add error visibility to allTasks query
- Expose `isError` and `error` from the `rawAllTasks` query so `ProjectsListContent` can pass it to `GlobalAnalyticsTab`
- Add `onError` toast notification so failures are visible to the user
- Remove `as any` from the tasks query if the type is available, or add explicit error logging

### 4. ProjectsListContent.tsx — Pass error state
- Pass error state from `useProjects` to `GlobalAnalyticsTab`

---

## Files to modify

| File | Change |
|------|--------|
| `TaskAnalyticsTab.tsx` | Remove KPI cards + remove duplicate timeline |
| `GlobalAnalyticsTab.tsx` | Add error state UI |
| `useProjects.ts` | Expose allTasks error, add error logging |
| `ProjectsListContent.tsx` | Pass error to GlobalAnalyticsTab |

No database changes needed.

