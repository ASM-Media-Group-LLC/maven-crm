

## Plan: Fix LeadGen Table Horizontal Scroll + Backfill Existing Leads to Closers

### Problem 1: Table no longer scrolls horizontally
The `Table` component wraps in `<div className="relative w-full">` but has no `min-width` forcing horizontal overflow. With the "Estado" column removed, the table might just fit — but on narrower viewports it compresses columns instead of scrolling. The table needs a `min-w-[900px]` on the `<table>` element to guarantee horizontal scroll when the viewport is narrow.

### Problem 2: Existing leads not visible in Closers
The auto-sync trigger only fires on **new inserts**. There are ~80,800 existing `leadgen_entries` but only 3 `closer_creators` records with `stage = 'Pendiente LG'`. A one-time backfill migration is needed to populate `closer_creators` from the existing `leadgen_entries` that don't already have a corresponding row.

### Changes

**1. `src/pages/leadgen/LeadGenTable.tsx`** (line 242)
- Add `className="min-w-[900px]"` to the `<Table>` element so it forces horizontal scroll within the `overflow-auto` wrapper

**2. Database migration: backfill existing leads**
```sql
INSERT INTO public.closer_creators (
  instagram_handle, source_account, category, phone,
  onlyfans_url, passed_date, stage,
  estimated_monetization, agency_commission,
  created_by, leadgen_entry_id
)
SELECT
  le.model_handle,
  le.company,
  le.quality,
  le.phone_raw,
  le.source_link,
  le.entry_date,
  'Pendiente LG',
  0, 0,
  le.lg_user_id,
  le.id
FROM public.leadgen_entries le
WHERE NOT EXISTS (
  SELECT 1 FROM public.closer_creators cc
  WHERE cc.leadgen_entry_id = le.id
);
```

This inserts ~80k rows into `closer_creators` with `stage = 'Pendiente LG'`, making them immediately visible in the Closers "Pendiente LG" tab.

### Files Modified
- `src/pages/leadgen/LeadGenTable.tsx` — add `min-w-[900px]` to Table
- New DB migration — backfill existing leadgen entries into closer_creators

