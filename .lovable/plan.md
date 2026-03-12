

## Fix: DateRangePicker sidebar width + Agent vs Agency separation

### Issue 1: "Semana pasada" text cut off in DateRangePicker
The preset sidebar has `w-[120px]` which is too narrow. Increase to `w-[140px]` to fit all preset labels.

**File**: `src/components/ui/date-range-picker.tsx` (line 161)
- Change `w-[120px]` to `w-[140px]`

### Issue 2: Agent column shows agency name as fallback
In `LeadGenContent.tsx` line 84, the `agent_name` enrichment falls back to `l.company` (the agency) when no profile is found. This means the "Agente" column sometimes shows the agency name instead of the actual user.

**File**: `src/pages/leadgen/LeadGenContent.tsx` (line 84)
- Change fallback from `l.company || "—"` to just `"—"`

### Issue 3: LeadGenBaseDatosContent uses LEADGEN_COMPANIES for "Agente" filter
The database view (`LeadGenBaseDatosContent.tsx`) uses `LEADGEN_COMPANIES` to populate the "Agente" filter dropdown -- these are agencies, not agents. Need to:
- Rename the filter to "Agencia" and keep using `LEADGEN_COMPANIES`
- Add a separate "Agente" filter that pulls from `profiles` (the actual users)
- Filter by `lg_user_id` for agent, by `company` for agency

**File**: `src/pages/leadgen/LeadGenBaseDatosContent.tsx`
- Rename existing `filterAgente`/agent selector to `filterAgencia` with label "Agencia"
- Add a new agent filter that uses `profilesMap` to list actual users
- Update filter logic accordingly

### Files to modify
- `src/components/ui/date-range-picker.tsx` -- widen sidebar
- `src/pages/leadgen/LeadGenContent.tsx` -- fix agent_name fallback
- `src/pages/leadgen/LeadGenBaseDatosContent.tsx` -- separate agent vs agency filters

