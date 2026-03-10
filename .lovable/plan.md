

## Fix: Lead Duplicate Prevention

### Problems Found

1. **No handle normalization before duplicate check** — `AddLeadModal.tsx` uses `.ilike("model_handle", data.model_handle)` with the raw input. If a user types `@usuario` and another types `usuario`, the `ilike` might match but the stored values differ. The `normalizeHandle()` utility exists and is used in other modules (Closers, Contactos, Creadores) but is **not used here**.

2. **No DB-level unique constraint** — The `leadgen_entries` table has no unique index on `model_handle` (or `model_handle + platform`). Only a primary key on `id` and indexes on `lg_user_id` and `entry_date`. This means race conditions or concurrent submissions can create duplicates regardless of client-side checks.

3. **`.maybeSingle()` fragility** — If duplicates already exist in the table, calling `.maybeSingle()` on a query that returns multiple rows will throw a PostgREST error instead of detecting the duplicate gracefully.

4. **Stored handles are not normalized** — The handle is inserted as-is (`data.model_handle`), meaning `@User`, `user`, and `https://instagram.com/user` could all be stored as separate entries.

### Changes

**1. Normalize handle before insert and duplicate check (`AddLeadModal.tsx`)**
- Import `normalizeHandle` from `@/lib/handle-utils`
- Normalize the handle before the duplicate check query
- Store the normalized value in the database
- Change `.maybeSingle()` to `.limit(1).maybeSingle()` for safety

**2. Add DB unique constraint (migration)**
- Create a unique index on `LOWER(model_handle), platform` to enforce uniqueness at the database level
- This prevents race-condition duplicates that client-side checks cannot catch

**3. Cross-table duplicate check**
- Also check `closers_contacts` and `creators` tables (as the memory notes mention the `/leadgen/new` page does), to prevent adding leads that already exist as contacts or creators. The current `AddLeadModal` skips this cross-check.

