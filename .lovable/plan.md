

## Plan: Fix 5 Issues — Promolog selector, Ticket column, AddLeadModal fields, LeadGen banner, Closers notes

### Issue 1: Promolog Rendimiento — Agent selector not working

**Root cause**: `CommandItem` lacks an explicit `value` prop. The cmdk library defaults to the text content and lowercases it, which can cause issues with `onSelect` not firing properly.

**Fix in `PromologPerformanceView.tsx`**:
- Add `value={a.id}` to each `CommandItem`
- This ensures the selection works regardless of name normalization

### Issue 2: Ticket column inconsistency

The "Ticket" column (`ticket_number`) appears in LeadGen table but serves no clear UX purpose — it's an auto-generated ID (`#LG` + last 7 chars of UUID). It adds visual noise without actionable information.

**Changes**:
- **Remove** the Ticket column from `LeadGenTable.tsx` (header and cell)
- Remove `ticket` sort key
- Keep `ticket_number` in data model (used internally for conversions to Closers)
- Remove `ticket` field from `NuevoContactoForm.tsx` form (it was already in Contactos but unused in display)
- Update search placeholder in `LeadGenContent.tsx`: "Buscar lead, agente..." (drop "ticket")

### Issue 3: AddLeadModal should match NuevoContactoForm fields

Currently `AddLeadModal` is missing fields that `NuevoContactoForm` has:
- **Nombre** (name)
- **Email**
- **Teléfono** (country code + phone)
- **Ciudad** (city)

**Changes in `AddLeadModal.tsx`**:
- Add fields: `nombre`, `email`, `countryCode` + `phone`, `ciudad` to the zod schema and form
- Add corresponding form inputs (matching NuevoContactoForm layout)
- Save these fields in the insert: `model_name`, `email`, `phone_raw` (with country code prefix), `city`
- Keep existing fields (URL, platform, category, company, country, OF URL, notes, evidence)

### Issue 4: LeadGen Performance banner — still plain header

Looking at the image, the Promolog "Rendimiento de Agentes" section header is plain text ("Rendimiento de Agentes / 31 de marzo, 2026 · 8 agentes activos") without the gradient banner style.

The `LeadGenPerformanceView.tsx` already has the banner (lines 75-111). The issue is in `PromologPerformanceView.tsx` lines 136-165 — it uses a plain `div` with just `flex items-center` instead of the gradient banner.

**Fix in `PromologPerformanceView.tsx`**:
- Replace the plain header (lines 136-165) with the gradient banner pattern from `LeadGenPerformanceView.tsx`:
  - `rounded-lg border overflow-hidden bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-l-[3px] border-l-primary`
  - Title, subtitle, selector on right, icon in circle badge

### Issue 5: Closers — OF URLs appearing in Notes field

The code correctly separates OF URL and Notes columns in all tabs. The issue is **data-level**: existing records in `closers_contacts` have OnlyFans URLs stored in the `notes` column (entered before the `onlyfans_url` column existed).

**Fix**: Run a data migration to move OF URLs from `notes` to `onlyfans_url`:
```sql
UPDATE closers_contacts
SET onlyfans_url = notes, notes = NULL
WHERE notes ILIKE '%onlyfans.com%'
  AND (onlyfans_url IS NULL OR onlyfans_url = '');
```

Also do the same for `closers_creators` if applicable.

### Files to modify

| File | Change |
|------|--------|
| `PromologPerformanceView.tsx` | Add `value` prop to CommandItem + gradient banner header |
| `LeadGenTable.tsx` | Remove Ticket column |
| `LeadGenContent.tsx` | Update search placeholder |
| `AddLeadModal.tsx` | Add nombre, email, phone, ciudad fields |
| Migration SQL | Move OF URLs from notes to onlyfans_url in closers tables |

