

## Plan: Make All LeadGen Entries Visible in Closers

### Problem
The Closers module only pulls `leadgen_entries` with status `interested` or `meeting_set` (6 records out of 80,509). The user wants ALL leads generated in LeadGen to be visible in Closers. Additionally, 33 remaining test records (`@m_*` handles from Oct 2025) still need cleanup.

### Key Challenge
There are ~80K leadgen entries. Loading them all into the "Todas" tab would be impractical. We need a dedicated tab with server-side pagination.

### Changes

**1. Add "Pendiente LG" tab to Closers** (`src/pages/closers/ClosersContent.tsx`)
- Add a new tab `{ value: "pendiente_lg", label: "Pendiente LG" }` visible to Admin/Manager roles
- This tab shows ALL unconverted leadgen entries (no status filter), with server-side pagination

**2. Update data fetching** (`src/pages/closers/hooks/useCloserLeads.ts`)
- Remove the status filter `.in("status", ["interested", "meeting_set"])` from the "todas" tab query
- For the new `pendiente_lg` tab: fetch from `leadgen_entries` WHERE `id NOT IN (select leadgen_entry_id from closer_creators where leadgen_entry_id is not null)`, with proper server-side pagination (100 rows per page)
- For the `todas` tab: keep fetching `closer_creators` as-is, plus append a count of pending LG entries (badge only, not full list)
- Add leadgen status display in the table rows so closers can see the current status of each lead

**3. Update LeadGen status values** (`src/pages/closers/hooks/useCloserLeads.ts`)
- Also include `interesado` in the status filter alongside `interested` (there's a mismatch: LeadGen uses Spanish `interesado` but Closers queries for English `interested`)
- Wait -- actually since we're removing the filter entirely for the new tab, this is handled implicitly

**4. Update tab mapping** (`src/pages/closers/hooks/useCloserLeads.ts`)
- Add `pendiente_lg: []` to `TAB_STAGE_MAP`
- When `activeTab === "pendiente_lg"`, skip the `closer_creators` query entirely and only query `leadgen_entries`
- Exclude already-converted entries (those with matching `leadgen_entry_id` in `closer_creators`)

**5. Clean remaining test data** (SQL migration)
- Delete 33 records: `DELETE FROM leadgen_entries WHERE model_handle LIKE '@m_%' AND entry_date < '2025-11-01'`
- Also delete any records with ID pattern `20000014-*` (the remaining fake IDs)

**6. Update "Todas" tab behavior**
- "Todas" tab continues to show all `closer_creators` records (converted leads)
- Remove the leadgen_entries fetch from "todas" tab since there's now a dedicated tab for it
- This simplifies the "todas" logic and avoids loading 80K records

### Files Modified
- `src/pages/closers/hooks/useCloserLeads.ts` -- add pendiente_lg tab logic, paginated LG query
- `src/pages/closers/ClosersContent.tsx` -- add new tab, wire it up
- `src/pages/closers/components/LeadTable.tsx` -- display leadgen status column for LG rows
- New SQL migration -- clean remaining test data

