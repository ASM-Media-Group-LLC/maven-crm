

## Plan: Fix Contact Insert Status & Table Ordering

### Problems Found

1. **Status mismatch on insert**: `NuevoContactoForm.tsx` line 138 inserts `status: "Nuevo"` (Spanish, capitalized) but the rest of the system uses English lowercase values (`new`, `contacted`, `interested`, `not_interested`). The `statusMap` in `ContactosContent.tsx` translates English→Spanish for display. Currently 4 records in the DB have `"Nuevo"` instead of `"new"`, meaning filters and KPIs may miscategorize them.

2. **No March 18 records exist in the database**: Only March 17 (3 records) and March 19 (1 record) exist. The inserts on March 18 may have failed silently. After fixing the status value, future inserts will be consistent.

3. **Table sort uses formatted date strings**: The `creacion` field is a locale-formatted string (`"19 mar, 14:30"`), so sorting by it produces alphabetical, not chronological order. The table should sort by the raw `created_at` timestamp.

### Changes

**File: `src/pages/contactos/NuevoContactoForm.tsx`**
- Line 138: Change `status: "Nuevo"` → `status: "new"` to match the expected English enum values used throughout the system.

**File: `src/pages/contactos/ContactosContent.tsx`**
- Add a `rawCreatedAt` field to the `Contacto` interface storing the ISO timestamp string from the DB.
- Populate `rawCreatedAt` in the mapping (line 140) alongside the formatted `creacion`.

**File: `src/pages/contactos/ContactosTable.tsx`**
- Update sort logic for the `creacion` column to compare using `rawCreatedAt` (ISO string comparison) instead of the formatted locale string, ensuring correct chronological order.
- Default sort: `creacion` descending (newest first) — already the default, but now it will work correctly.

**Database fix (migration)**
- Update the 4 existing records with `status = 'Nuevo'` to `status = 'new'` so they're consistent.

### Files Modified
- `src/pages/contactos/NuevoContactoForm.tsx` — fix status value
- `src/pages/contactos/ContactosContent.tsx` — add `rawCreatedAt` field
- `src/pages/contactos/ContactosTable.tsx` — fix sort by date
- SQL migration to normalize existing `"Nuevo"` → `"new"`

