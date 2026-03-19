

## Plan: Clean Test Data & Update Contact Form to Use Link Instead of Handle

### Problem 1: Test data in Closers
The 209 `team_*` records in `leadgen_entries` are **seed/test data** from October 2025 with fake user IDs (`55555555-...`, `11111111-...`) and fake URLs (`https://example.com/...`). They were inserted during development and are polluting the Closers pipeline. They need to be deleted.

### Problem 2: Contact form asks for "Handle" instead of "Link"
The `NuevoContactoForm` currently has a field labeled "Handle" that accepts `@usuario` or a link. It should instead ask for the **link of the account** and auto-extract the handle and platform from it — the same pattern already used in `AddLeadModal.tsx` (LeadGen).

---

### Changes

**1. Delete test data (SQL via insert tool)**
- `DELETE FROM leadgen_entries WHERE model_handle LIKE 'team_%'` — removes the 209 fake records.

**2. File: `src/pages/contactos/NuevoContactoForm.tsx`**

- **Rename form field**: Change `instagramLink` → `accountLink` in `FormData` interface and default values. Update label from "Handle *" to "Link de la Cuenta *".
- **Add auto-extraction**: Import `normalizeHandle` and `detectPlatformFromUrl` from `@/lib/handle-utils`. When the user types a URL, auto-detect the platform and update the platform selector automatically (same pattern as `AddLeadModal`).
- **Update placeholder**: Change from `@usuario o handle` to `https://instagram.com/usuario`.
- **Update validation**: Error message from "El handle es obligatorio" to "El link de la cuenta es obligatorio".
- **Update insert logic**: Extract handle from the link using `normalizeHandle()` before saving to `handle` column. Auto-detect platform with `detectPlatformFromUrl()`.
- **Remove hint text**: Remove the line "Puedes ingresar el handle (@usuario) o el link completo" since the field now explicitly asks for the link.

### Files Modified
- `src/pages/contactos/NuevoContactoForm.tsx`
- SQL data cleanup (delete test records)

