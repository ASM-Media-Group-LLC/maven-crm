

## Plan: Replace Date Select with DateRangePicker + Add "Creado por" Filter

### Changes

**1. `src/pages/contactos/ContactosFilters.tsx`**
- Update `ContactoFilters` interface: replace `fechaCreacion: string` with `dateFrom: string` and `dateTo: string`, add `creadoPor: string`
- Remove the `CalendarDays` Select dropdown for fecha
- Add `DateRangePicker` component (same as EventosFilters) with `onApply` that sets `dateFrom`/`dateTo` via `format(date, "yyyy-MM-dd")`
- Add a new `FilterSelect` for "Creado por" that receives a `creators` prop (list of `{value, label}`) and filters by user

**2. `src/pages/contactos/ContactosContent.tsx`**
- Update `emptyFilters` to use `dateFrom: ""`, `dateTo: ""`, `creadoPor: ""` instead of `fechaCreacion: ""`
- Build a `creators` list from `profilesMap` (unique creator names with their IDs) to pass to `ContactosFilters`
- Replace the `fechaCreacion` filter logic in `filtered` useMemo with date range comparison: parse `dateFrom`/`dateTo` and check `created_at` falls within range
- Add `creadoPor` filter: match `c.creadoPor` against the selected creator name, or match by creator UUID from `dbContactos`
- Pass `creators` list to `ContactosFilters`

### Summary
- Date filter becomes a full DateRangePicker with calendar, presets, and manual input (matching Eventos)
- New "Creado por" dropdown lets users filter contacts by the user who created them

