

## Plan: Standardize Company Names & Add Agency Filter

### Problem
1. **Duplicates in DB**: `KASH Agency` / `kash-agency` and `UNLOK` / `unlok` exist as separate values
2. **No agency/company filter** in the main LeadGen view (only exists in the Database view, where it incorrectly uses `company` as "agente")
3. **`LEADGEN_COMPANIES` constant** is hardcoded and doesn't match actual DB values

### Changes

**1. Data cleanup (SQL UPDATE via insert tool)**
- Normalize `kash-agency` → `KASH Agency` and `unlok` → `UNLOK` in `leadgen_entries`

**2. `src/pages/leadgen/leadgenConstants.ts`**
- Update `LEADGEN_COMPANIES` to match the 9 canonical names: `alvaroletshoot`, `Blu app`, `Exchange`, `KASH Agency`, `Ora Miami`, `Pagomundo`, `piclink.me`, `Trafix`, `UNLOK`

**3. `src/pages/leadgen/LeadGenContent.tsx`**
- Add a new `agencyFilter` state (`"todos"` | company name)
- Add a `<Select>` dropdown for "Agencia" using `LEADGEN_COMPANIES` in the filter bar
- Apply the filter in `filteredLeads`: check `lead.company === agencyFilter`

**4. `src/pages/leadgen/LeadGenBaseDatosContent.tsx`**
- Rename the existing "Agente" filter to "Agencia" (it already filters by `company`)
- Use `LEADGEN_COMPANIES` constant instead of dynamically deriving from data (ensures consistency)

**5. `src/pages/contactos/ContactosFilters.tsx`** (if applicable)
- No changes needed — Contactos doesn't filter by agency

### Summary
- Fix 2 duplicate company names in the database
- Sync the hardcoded constant with actual DB values
- Add agency filter to main LeadGen view
- Rename misleading "Agente" filter label in Database view to "Agencia"

