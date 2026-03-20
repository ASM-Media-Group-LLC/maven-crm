

## Plan: Align Edit Modal Fields with Create Form

### Differences Found
1. **EditContactoModal** still uses a plain "Handle/Usuario" text field (`@usuario`), while NuevoContactoForm was updated to use "Link de la Cuenta" with `normalizeHandle` + `detectPlatformFromUrl` auto-extraction.
2. **EditContactoModal** is missing the "Número de Ticket" field entirely -- it's not shown and not saved on update.
3. Minor label inconsistency: create form says "Categoría Física *", edit says "Categoría".

### Changes

**File: `src/pages/contactos/EditContactoModal.tsx`**

1. **Replace Handle field with Link de la Cuenta field**: Rename state from `handle` to `accountLink`. Import `normalizeHandle` and `detectPlatformFromUrl`. When the field value changes, auto-detect platform (same logic as NuevoContactoForm). On save, extract handle via `normalizeHandle()` before sending to DB.

2. **Add Ticket field**: Add a `ticket` state variable, initialize from `contacto.ticket` in the sync block. Add a "Número de Ticket" input field below the Notas field. Include `ticket_number: ticket || null` in the `.update()` call.

3. **Fix Categoría label**: Change from "Categoría" to "Categoría Física" for consistency.

4. **Pre-populate accountLink**: When loading an existing contact, set `accountLink` to the stored handle value (since old records only have the handle, not the full URL).

### Files Modified
- `src/pages/contactos/EditContactoModal.tsx`

