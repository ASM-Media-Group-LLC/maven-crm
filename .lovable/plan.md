

## Plan: Fix Contact Filters Logic

### Root Cause
Three issues found:

1. **Status mismatch**: DB stores English values (`new`, `contacted`, `interested`, `not_interested`) but filters use Spanish labels (`Nuevo`, `Contactado`, `Convertido`, `Descartado`). The `estado` field in the Contacto mapping passes `c.status` raw without translation, so `filters.estado === c.estado` never matches.

2. **Date filter not applied**: The `fechaCreacion` filter (Hoy/Esta semana/Este mes) is rendered in the UI but never checked in the `filtered` useMemo — it's completely ignored.

3. **Incomplete country list**: DB has 20 distinct country codes but filters only list 9.

### Changes

**1. `ContactosContent.tsx`**
- Add a status translation map: `{ new: "Nuevo", contacted: "Contactado", interested: "Interesado", not_interested: "Descartado" }`
- Apply the map on line 121: `estado: statusMap[c.status] || c.status || "Nuevo"`
- Add `fechaCreacion` filter logic in the `filtered` useMemo — lookup the raw `created_at` from `dbContactos` and compare against today/this week/this month
- Fix KPI counters that also depend on translated estado values

**2. `ContactosFilters.tsx`**
- Update Estado options to match translated values: `["Nuevo", "Contactado", "Interesado", "Descartado"]` (change "Convertido" to "Interesado" to match DB value `interested`)
- Update country list to include all 20 DB values: add `CR`, `EC`, `GB`, `GT`, `HN`, `IT`, `PA`, `PY`, `SV`, `TH`, `VE`

**3. `ContactosTable.tsx` / `ContactosGrid.tsx`**
- No changes needed — they render `c.estado` which will now be the correct Spanish label

