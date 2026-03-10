

## Review and Changes

### Conversion Flows - Status

**Lead → Contacto** (`ConvertLeadModal.tsx`): Functional. Inserts into `closers_contacts` with handle, platform, country, phone, company, ticket. Marks lead as "contactado". Invalidates both query caches. No issues found.

**Contacto → Creador** (`ConvertContactoModal.tsx`): Functional. Inserts into `creators` with name, handle, country, category, phone, email, photo, source="contacto", status="pendiente". Marks contact as "Convertido". Invalidates both query caches. No issues found.

### Change: Remove "Contactos" placeholder from /closers

**File: `src/pages/closers/ClosersContent.tsx`**

- Remove lines 55-63 (the "Contactos" section with the dashed border placeholder that says "Sección de contactos próximamente"). This section is obsolete since contacts now have their own dedicated module at `/contactos`.

One file, one deletion.

