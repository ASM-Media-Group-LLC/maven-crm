

## Plan: Remove Status Column from LeadGen + Auto-sync Leads to Closers

### Problem
1. The "Estado" (status) column exists in LeadGen tables/grids but is never set by the user when creating a lead — it defaults to `no_response` and has no meaning in the LeadGen context.
2. Leads should automatically appear in the Closers module without manual conversion, but currently the only path is through the "Convertir a Contacto" button in ViewLeadModal.

### Part A: Remove Status Column from LeadGen UI

**Files to modify:**

**1. `src/pages/leadgen/LeadGenTable.tsx`**
- Remove the `StatusCell` component entirely (lines 121-158)
- Remove `useUpdateLeadStatus` import
- Remove `statusVariant`, `statusLabels`, `STATUS_OPTIONS` constants
- Remove the `<TableHead>` for "Estado" and `<TableCell><StatusCell>` from `LeadRow`
- Remove `"estado"` from the `SortKey` type and from the sort switch
- Update `colSpan` in the empty row from 11 to 10

**2. `src/pages/leadgen/LeadGenGrid.tsx`**
- Remove the "Estado" row from the card info (lines 123-128)
- Remove `statusVariant` and `statusLabels` constants

**3. `src/pages/leadgen/LeadGenContent.tsx`**
- Remove the status filter `<Select>` (lines 283-291)
- Remove `statusFilter` state and its usage in `filteredLeads`
- Remove `STATUS_OPTIONS` from imports
- Keep `knownStatuses` and `activeFilter.type === "status"` logic since the EstadosCard still uses it for response tracking (respondieron/interesadas/etc.) — these reflect closers pipeline stages, not leadgen status

**4. `src/pages/leadgen/LeadGenEstadosCard.tsx`**
- Keep as-is. This card tracks response outcomes which are useful KPIs even if status isn't editable in the table. The data comes from the `status` DB column which will still be updated automatically when leads flow to closers.

**5. `src/pages/leadgen/LeadGenBaseDatosContent.tsx`**
- Remove the "Estado" column from the table header and table body
- Remove the "Estado" badge from the grid card view
- Remove `statusLabels` constant and status filter if present

**6. `src/pages/leadgen/AgentDetailView.tsx`**
- Remove status badge from table rows and grid cards (lines 331, 380)

**7. `src/pages/leadgen/ViewLeadModal.tsx`**
- No status display exists here currently — no changes needed

**8. `src/pages/leadgen/useLeadGen.ts`**
- Remove `useUpdateLeadStatus` hook entirely (lines 213-230)
- Keep `status` in the type and query columns since it's still in the DB and used by EstadosCard

**9. `src/pages/leadgen/leadgenConstants.ts`**
- Remove `STATUS_OPTIONS` export
- Remove `STATUS_COLORS` export

### Part B: Auto-sync Leads to Closers

Currently the "Pendiente LG" tab in Closers already queries `leadgen_entries` directly (filtering out already-converted ones). This means leads **do** appear in Closers automatically. The issue is that no `closer_creators` row is created until manual conversion.

**Solution: Create a database trigger** that automatically inserts a `closer_creators` row whenever a new `leadgen_entries` row is created.

**Database migration:**
```sql
CREATE OR REPLACE FUNCTION public.auto_sync_leadgen_to_closers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.closer_creators (
    instagram_handle,
    source_account,
    category,
    phone,
    onlyfans_url,
    passed_date,
    stage,
    estimated_monetization,
    agency_commission,
    created_by,
    leadgen_entry_id
  ) VALUES (
    NEW.model_handle,
    NEW.company,
    NEW.quality,
    NEW.phone_raw,
    NEW.source_link,
    NEW.entry_date,
    'Pendiente LG',
    0,
    0,
    NEW.lg_user_id,
    NEW.id
  );
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  -- Already exists, skip
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_sync_leadgen_to_closers
AFTER INSERT ON public.leadgen_entries
FOR EACH ROW
EXECUTE FUNCTION public.auto_sync_leadgen_to_closers();
```

**10. `src/pages/leadgen/ConvertLeadModal.tsx`**
- Update to check if a `closer_creators` row already exists (via `leadgen_entry_id`) and update its stage instead of inserting a duplicate
- Change logic: if row exists, update `stage` to `'Asignada'` and set `assigned_to`; if not, insert as before

**11. `src/pages/closers/hooks/useCloserLeads.ts`**
- The "Pendiente LG" tab currently queries `leadgen_entries` directly and builds virtual rows. With the trigger, real `closer_creators` rows will exist with `stage = 'Pendiente LG'`, so this tab can be simplified to query `closer_creators` like all other tabs (just filtering by stage)
- Remove the special `leadgen_entries` fetch logic for `pendiente_lg` tab

### Cleanup
- Remove unused `useUpdateLeadStatus` import from `LeadGenTable.tsx`
- Remove orphan `STATUS_OPTIONS` and `STATUS_COLORS` from `leadgenConstants.ts`
- Remove `statusFilter` state variable from `LeadGenContent.tsx`

### Files Modified
- `src/pages/leadgen/LeadGenTable.tsx`
- `src/pages/leadgen/LeadGenGrid.tsx`
- `src/pages/leadgen/LeadGenContent.tsx`
- `src/pages/leadgen/LeadGenBaseDatosContent.tsx`
- `src/pages/leadgen/AgentDetailView.tsx`
- `src/pages/leadgen/useLeadGen.ts`
- `src/pages/leadgen/leadgenConstants.ts`
- `src/pages/leadgen/ConvertLeadModal.tsx`
- `src/pages/closers/hooks/useCloserLeads.ts`
- New DB migration: auto-sync trigger

