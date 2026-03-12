

## Closers Module -- Audit and Enhancement Plan

### Issues Identified

1. **Missing "Mis Creators" TabsTrigger** -- users can't navigate back to the default tab after clicking another one.

2. **No "Contactada?" column** -- the spreadsheets show a clear "Contactada? Si/No" indicator. Currently the table has no quick visual for whether a creator has been contacted. This should be derived from `last_contact_date` (not null = Si).

3. **No stage-change actions in the table rows** -- closers cannot advance a creator through the pipeline (e.g., "Asignada" -> "En negociacion") directly from the table. There are no inline actions for marking stages, only the edit modal which is slow for operational use.

4. **No direct feed from LeadGen** -- the `ConvertLeadModal` sends leads to `closers_contacts`, NOT to `closer_creators`. The Closers module reads from `closer_creators` which is a completely separate table. There is no flow that moves a `closers_contacts` record into `closer_creators`, so the pipeline is disconnected.

5. **Missing "Contactada?" (boolean column) in the table** -- the spreadsheet clearly shows this as a key operational field.

6. **LeadGen data not mapped** -- when a lead is converted, fields like `company` (Cuenta origen/agencia), `quality` (Categoría), `phone_raw`, and `source_link` should flow into `closer_creators`.

---

### Plan

#### 1. Restore "Mis Creators" tab trigger
- Add `<TabsTrigger value="mis-creators">Mis Creators</TabsTrigger>` back in `ClosersContent.tsx`.

#### 2. Add "Contactada?" column to MisCreatorsTab
- Add a computed column showing "Si" (green badge) or "No" (red badge) based on whether `last_contact_date` is not null.
- Position it after "Cuenta origen" to match the spreadsheet layout.

#### 3. Add inline stage actions (row-level)
- Add a **dropdown action menu** (three-dot menu or stage-change buttons) in the `CreatorTable` actions column, allowing closers to:
  - **Advance stage** (next logical step in the pipeline)
  - **Mark as "No interesada"** (with rejection reason prompt)
  - **Register contact** (quick add to contact history)
  - **Change stage** to any valid stage via dropdown
- Wire these to `updateStage` mutation from `useCloserCreators`.

#### 4. Connect LeadGen -> Closer Creators pipeline
- Modify `ConvertLeadModal` to insert directly into `closer_creators` (instead of or in addition to `closers_contacts`), mapping:
  - `model_handle` -> `instagram_handle`
  - `company` -> `source_account`
  - `quality` -> `category`
  - `phone_raw` -> `phone`
  - `entry_date` -> `passed_date`
  - `source_link` -> `onlyfans_url` (if applicable)
- Update the lead status to `"contactado"` after conversion.
- Invalidate both `leadgen` and `closer-creators` query caches.

#### 5. Add quick-action buttons to CreatorTable
- In the actions column, add:
  - **Stage selector dropdown** -- allows changing stage inline
  - **Register contact** shortcut button (opens compact inline form or the ContactHistoryPanel in a popover)
  - Keep existing View/Edit/Delete buttons

---

### Files to modify
- `src/pages/closers/ClosersContent.tsx` -- restore tab trigger
- `src/pages/closers/tabs/MisCreatorsTab.tsx` -- add "Contactada?" column
- `src/pages/closers/components/CreatorTable.tsx` -- add stage-change dropdown and quick-contact action
- `src/pages/leadgen/ConvertLeadModal.tsx` -- insert into `closer_creators` instead of/alongside `closers_contacts`
- `src/pages/closers/useCloserCreators.ts` -- potentially add a "markRejected" mutation with reason

