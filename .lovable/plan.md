

## Plan: Show Creator Name and Creation Date in Contacts Directory

### Problem
The "Creado por" column in the contacts table/grid displays the raw `created_by` UUID instead of the user's full name.

### Solution
Fetch profiles for all distinct `created_by` IDs and resolve them to `full_name` in the contact mapping.

### Changes

**1. `src/pages/contactos/ContactosContent.tsx`**
- Add a query to fetch `profiles` for all unique `created_by` user IDs from `dbContactos`
- In the `allContactos` mapping, replace `c.created_by || ""` with the resolved `full_name` from the profiles lookup
- Ensure `creacion` shows a clear date+time format (already does, but will verify formatting is clean)

**2. `src/pages/contactos/ContactosTable.tsx`**
- No structural changes needed — already renders `c.creadoPor` and `c.creacion` columns

**3. `src/pages/contactos/ContactosGrid.tsx`**
- Add display of `c.creadoPor` (creator name) and `c.creacion` (date) in the card layout, since they are currently missing from the grid view

### Technical Detail
```
Query: supabase.from("profiles").select("id, full_name").in("id", uniqueCreatorIds)
Mapping: profiles stored in a Record<string, string> → used to resolve creadoPor
```

This is a read-only UI enhancement with no database changes required.

