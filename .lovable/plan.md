

## Plan: Fix "Agente" Column in LeadGen + "Creado por" in Contactos

### Root Cause Analysis

**Contactos ("Creado por" empty):** The `created_by` UUIDs in `closers_contacts` are from the old/migrated system and have NO matching entries in `profiles` or `auth.users`. The profile resolution query returns empty for all 458 contacts. New contacts created through the current app will show the creator name correctly, but legacy data cannot be resolved.

**LeadGen ("Agente" shows agency name):** The "Agente" column (line 152 of LeadGenTable) displays `lead.company` (e.g., "KASH Agency", "Exchange") instead of `lead.agent_name` (the resolved profile name). `company` is the agency, not the agent. Additionally, there is no separate "Agencia" column to show the company/agency.

### Changes

**1. `src/pages/leadgen/LeadGenTable.tsx`**
- Change "Agente" column to display `lead.agent_name` (resolved profile name) instead of `lead.company`
- Add a new "Agencia" column after "Agente" to display `lead.company` (the agency name)
- Add sorting support for the new "agencia" column
- Update colspan for empty state

**2. `src/pages/leadgen/LeadGenGrid.tsx`**
- Same fix: show `agent_name` as the agent and `company` as the agency separately

**3. `src/pages/contactos/ContactosContent.tsx`**
- For legacy contacts where `profilesMap` returns empty, fall back to displaying the UUID's first 8 characters as "Usuario #XXXXXXXX" so the column isn't blank
- This is a temporary measure; future contacts created via the app will display the real name

**4. `src/pages/contactos/ContactosGrid.tsx`**
- Same fallback for the creator name display

### Summary
- LeadGen: split "Agente" (person) from "Agencia" (company) into two distinct columns
- Contactos: add fallback text for legacy contacts with unresolvable creator UUIDs

