

## Plan: Fix LeadGen → Contactos → Closers Data Flow + Table Column Fixes

### Problem Summary
1. **Broken data flow**: `AddContactoModal` in LeadGen inserts into the `contactos` table, but `/contactos` page reads from `closers_contacts`. Data created from LeadGen never shows up in Contactos.
2. **Contactos table shows "País" instead of "Teléfono"**: The column labeled "País" should display the phone number.
3. **Closers table missing "Fecha creación"**: No creation date column in any of the Closers tabs.

### Changes

#### 1. Fix `AddContactoModal` to insert into `closers_contacts` (not `contactos`)
**File: `src/pages/leadgen/AddContactoModal.tsx`**
- Change `supabase.from("contactos").insert(...)` to `supabase.from("closers_contacts").insert(...)`
- Map field names to match `closers_contacts` schema: `nombre` → `name`, `instagram` → `handle`, `categoria_fisica` → `physical_appearance`, `compania` → `company`, `telefono` → `phone`, `notas` → `notes`, `country_code` stays
- Add `created_by: user.id` (requires importing useAuth) and `platform: "Instagram"`
- Update duplicate check from `contactos` to `closers_contacts`

#### 2. Replace "País" with "Teléfono" in Contactos table
**File: `src/pages/contactos/ContactosTable.tsx`**
- Change header label from "País" to "Teléfono" (line 96)
- Change cell content from `c.pais` to display the phone number with country code: `{c.country_code}{c.phone}` (line 130)
- Make it a WhatsApp-clickable link like the existing WhatsApp column, or just plain text with the number
- Remove the now-redundant WhatsApp column (since phone is already shown), or keep both if preferred

#### 3. Add "Fecha creación" column to Closers table
**File: `src/pages/closers/components/LeadTable.tsx`**
- Add "Creación" header to each tab's headers (todas, asignadas, pendiente_lg, etc.)
- Add cell rendering: `format(new Date(c.created_at), "dd/MM/yyyy")` in each tab's row renderer
- The `created_at` field already exists in `CloserCreatorRow` interface

### Files to modify
1. `src/pages/leadgen/AddContactoModal.tsx` — fix table target + field mapping
2. `src/pages/contactos/ContactosTable.tsx` — País → Teléfono column
3. `src/pages/closers/components/LeadTable.tsx` — add Creación column to all tabs

