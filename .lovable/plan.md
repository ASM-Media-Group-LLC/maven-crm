

## Plan: Fix LeadGen Filters, DateRangePicker, Table Scroll, and Quality Actions

### Issues Found

1. **DateRangePicker text truncation**: Preset sidebar is `w-[140px]` but "Semana pasada" still clips inside ghost buttons. Need to increase to `w-[160px]`.

2. **No "Todo" option for dates**: Currently defaults to today. Users need a way to clear the date filter and see all leads. Add a "Todo" preset to the DateRangePicker that passes `undefined/undefined` to clear the date range, and handle `undefined` dates in the query hook to fetch all records.

3. **Table scroll only works with touch, not mouse**: The `Table` component (table.tsx) wraps the `<table>` in `<div className="relative w-full">` which doesn't have `overflow-x-auto`. The outer `LeadGenTable` div has `overflow-auto` but the inner wrapper absorbs it. Fix: add `overflow-x-auto` to the Table component's wrapper div.

4. **Quality action redundant in grid**: `LeadGenGrid.tsx` has a Medal button per card that opens `AssignCalidadModal`. Since quality is already inline-editable in the table rows via `QualityCell`, remove the Medal button and `AssignCalidadModal` usage from the grid. Quality badge is already shown in the card header — that's sufficient for grid view.

5. **Filters verification**: Quality and agency filters look correct in the code. The `qualityFilter` comparison uses `.toLowerCase()` which matches the stored values. No bug found there.

### Changes

**1. `src/components/ui/table.tsx`** (line 7)
- Change wrapper div from `className="relative w-full"` to `className="relative w-full overflow-x-auto"` so horizontal scroll works with mouse/trackpad, not just touch.

**2. `src/components/ui/date-range-picker.tsx`**
- Increase preset sidebar width from `w-[140px]` to `w-[160px]`
- Add a "Todo" preset at the top that returns `{ from: undefined, to: undefined }` so users can clear the date range

**3. `src/pages/leadgen/LeadGenContent.tsx`**
- Initialize `dateFrom` and `dateTo` as `undefined` instead of `new Date()` so the default view shows all leads (or keep today — user said "un filter que diga Todo", so the Todo preset in the picker handles it)
- Handle the case where `dateFrom`/`dateTo` are both undefined in the query: fetch without date filters

**4. `src/pages/leadgen/useLeadGen.ts`**
- Update `useLeadGenByDateRange` to handle empty/undefined date strings — when both are empty, skip the date range filter and return all leads

**5. `src/pages/leadgen/LeadGenGrid.tsx`**
- Remove the Medal button from card actions
- Remove `AssignCalidadModal` import and state (`calidadLead`)
- Remove the `AssignCalidadModal` component render at the bottom

**6. `src/pages/leadgen/LeadGenTable.tsx`**
- Remove the outer `overflow-auto` wrapper's redundant scroll since `Table` component will now handle it internally (keep `max-h` and `overflow-auto` for vertical scroll, but the horizontal scroll will propagate through the fixed Table wrapper)

### Files Modified
- `src/components/ui/table.tsx`
- `src/components/ui/date-range-picker.tsx`
- `src/pages/leadgen/LeadGenContent.tsx`
- `src/pages/leadgen/useLeadGen.ts`
- `src/pages/leadgen/LeadGenGrid.tsx`

