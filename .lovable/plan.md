

## Plan: Fix sticky header and move date picker before "Reporte" button

### Step 1: Make header + filters sticky in `SalesOverview.tsx`
- Extract header and filters out of `<main>` scrollable area into a fixed `shrink-0` section above it
- Header section gets `shrink-0 px-6 pt-6 pb-4 space-y-4 border-b bg-background` styling
- `<main>` keeps `flex-1 overflow-auto p-6 space-y-6` for scrollable content (KPIs, charts, table, etc.)

### Step 2: Integrate date picker into header row in `SalesOverviewHeader.tsx`
- Add `from`, `to`, `onDateChange` props to `SalesOverviewHeader`
- Place `DateRangePicker` between the badges and the "Reporte" button (inside the right-side actions div, before "Reporte")
- Remove `SalesOverviewFilters` component usage from `SalesOverview.tsx` since it moves into the header

### Files to modify:
- `src/pages/SalesOverview.tsx` — split layout into sticky header + scrollable content, remove `SalesOverviewFilters`, pass date props to header
- `src/pages/sales-overview/SalesOverviewHeader.tsx` — add date picker props and render `DateRangePicker` before "Reporte" button

