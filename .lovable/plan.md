

## Fix: Select Filters Default Text in LeadGen

### Problem
The select filters show "Todos los estados", "Calidad", "Todas las agencias" as their selected value when in the default (unfiltered) state. The user wants the placeholder text to show instead (e.g., "Estado", "Agencia", "Calidad") — no "Todos" wording.

### Changes in `src/pages/leadgen/LeadGenContent.tsx`

1. **Change default filter values** from `"todos"` to `""` (empty string):
   - `statusFilter`: `""` instead of `"todos"`
   - `qualityFilter`: `""` instead of `"todos"`
   - `qaFilter`: `""` instead of `"todos"`
   - `agencyFilter`: `""` instead of `"todos"`

2. **Update filter logic** — replace `!== "todos"` checks with `!== ""` in the `filteredLeads` memo.

3. **Update Select components** — use `value={statusFilter || undefined}` so the placeholder shows when empty, and change `onValueChange` to map `"__all__"` back to `""`:
   ```tsx
   <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
     <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
     <SelectContent>
       <SelectItem value="__all__">Todos</SelectItem>
       {STATUS_OPTIONS.map(...)}
     </SelectContent>
   </Select>
   ```
   Same pattern for `qualityFilter` (placeholder: "Calidad") and `agencyFilter` (placeholder: "Agencia").

4. **DateRangePicker** — already has `placeholder="Selecciona fechas"` and it works correctly when `from`/`to` are undefined. The current issue is that `dateFrom` and `dateTo` default to `new Date()` (today), so the picker always shows today's date. No change needed here since the user specifically wants date filtering to default to today.

### Files to modify
- `src/pages/leadgen/LeadGenContent.tsx` — 3 select filters: update default values, filter logic, and Select component patterns

