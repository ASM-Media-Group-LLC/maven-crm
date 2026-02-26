

## Issues Found

1. **Native `<select>` instead of Shadcn `Select`**: `DashboardFilters.tsx` line 113 uses a raw HTML `<select>` for Net/Gross toggle. This violates the design system which requires Shadcn `Select` components.

2. **Net/Gross filter is decorative only**: The `<select>` has no `onChange`, no state, and no prop to propagate the selection. It doesn't filter or transform any data. All charts and tables always show `total_earnings_gross` regardless of the selection.

3. **Compare mode works structurally** but the compare data only flows into some components (`EarningsTrendChart`, `ConcentrationChart`, `CreatorStatsCards`, `SalesReportSection`). The `EarningsByChannelChart` does NOT accept `comparedRows`. This is a gap.

## Plan

### Step 1: Add `earningsMode` state to `SalesDashboard.tsx`
- Add state: `const [earningsMode, setEarningsMode] = useState<"net" | "gross">("net")`
- Pass `earningsMode` and `onEarningsModeChange` to `DashboardFilters`
- Pass `earningsMode` down to all chart/table components

### Step 2: Replace native `<select>` with Shadcn `Select` in `DashboardFilters.tsx`
- Replace the HTML `<select>` (line 113-116) with a `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` from `@/components/ui/select`
- Wire it to `earningsMode` prop and `onEarningsModeChange` callback
- Options: "Net Earnings" (value `net`) and "Gross Earnings" (value `gross`)

### Step 3: Apply `earningsMode` filtering in data pipeline
- In `SalesDashboard.tsx`, create a helper that maps `earningsMode` to the correct field (`total_earnings_gross` for gross, computed `total_earnings_gross * 0.80` for net)
- In `EarningsTrendChart.tsx`: use the mode to pick gross or net values in `groupByDay`
- In `EarningsSummary.tsx`: use the mode for totals display
- In `CreatorStatsCards.tsx`: use the mode for card values
- In `ConcentrationChart.tsx`: use the mode for concentration calculation
- In `SalesReportSection.tsx`: already computes both, just needs to sort/highlight based on mode
- In `EarningsByChannelChart.tsx`: use the mode for channel breakdown values

### Step 4: Add `comparedRows` to `EarningsByChannelChart`
- Update `EarningsByChannelChart` to accept and display `comparedRows` for consistency with compare mode

### Step 5: Pass `earningsMode` as prop type
- Add `earningsMode: "net" | "gross"` to `DashboardFiltersProps` interface and all downstream component props

