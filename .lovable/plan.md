

## Problem

The "Creado por" filter is not visible because `creatorsList` only includes creators found in the `profiles` table. Since most legacy contacts have unresolvable UUIDs, the list is empty, and the conditional `{creators.length > 0 && ...}` hides the dropdown entirely.

Additionally, the label should be "Agente" instead of "Creado por".

## Changes

**1. `src/pages/contactos/ContactosContent.tsx`**
- Update `creatorsList` to include ALL unique creators — resolved names from `profilesMap` AND fallback "Usuario #XXXXXXXX" for unresolvable UUIDs
- Derive the list from `dbContactos` creator IDs, not just `profilesMap` entries

**2. `src/pages/contactos/ContactosFilters.tsx`**
- Rename placeholder from `"Creado por"` to `"Agente"`
- Remove the `{creators.length > 0 && ...}` conditional so the select always renders (or keep it, since the list will now be populated)

