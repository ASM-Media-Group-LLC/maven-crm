

## Diagnostic: Sales Dashboard Filter Functionality

### Fully Functional Filters
- **Time Period buttons** (Ayer/Hoy/Esta semana/Este mes): Working correctly, filters `filteredRows` by `effective_date`
- **Net/Gross Select**: Working correctly on `EarningsTrendChart`, `EarningsByChannelChart`, `ConcentrationChart`, `CreatorStatsCards`
- **Compare mode**: Working on `EarningsTrendChart`, `EarningsByChannelChart`, `ConcentrationChart`, `CreatorStatsCards`, `SalesReportSection`
- **View tabs** (Vista General / Rendimiento por Creadora): Working correctly
- **SalesReportSection search**: Working correctly

### Issues Found

#### Issue 1: `EarningsSummary` is NOT rendered anywhere
`EarningsSummary.tsx` exists but is **never imported or used** in `SalesDashboard.tsx`. It also lacks `earningsMode` support — it always shows gross values. This component is dead code.

#### Issue 2: `CreatorPerformanceView` ignores `earningsMode`
The "Rendimiento por Creadora" tab (line 144) passes only `rows` but does NOT pass `earningsMode`. The child components (`CreatorEarningsChart`, `EarningsBreakdownChart`, `EarningsHeatmap`, `ChargebacksChart`) all use raw gross values and never apply the net factor.

#### Issue 3: `ConcentrationChart` internal filter tabs are decorative
The "Ver Top 20%" and "Ver Bottom 80%" buttons (`activeFilter` state at line 60) are rendered but **never applied** to the data. The `buildLorenz` function ignores `activeFilter` entirely.

#### Issue 4: `SalesReportSection` earningsMode partially broken
The `earningsMode` is used inside the `useMemo` (line 59-61) but it's **not listed in the dependency array** (line 87). Changing Net/Gross won't re-compute the enriched data.

---

## Plan

### Step 1: Fix `SalesReportSection` missing dependency
Add `earningsMode` to the `useMemo` dependency array on line 87.

### Step 2: Wire `earningsMode` into `CreatorPerformanceView`
- Update `CreatorPerformanceView` props to accept `earningsMode`
- Pass it from `SalesDashboard.tsx` line 144
- Propagate to `CreatorEarningsChart`, `EarningsBreakdownChart`, `EarningsHeatmap`, `ChargebacksChart`
- Apply `NET_FACTOR` in each component's data calculation

### Step 3: Make `ConcentrationChart` filter tabs functional
- Filter the Lorenz curve data based on `activeFilter`:
  - `top20`: show only the top 20% of creators
  - `bottom80`: show only the bottom 80% of creators
  - `all`: show all (current behavior)

### Step 4: Remove dead `EarningsSummary` or integrate it
- Since it's unused, remove the import reference or integrate it into the dashboard if intended. Will remove since `CreatorStatsCards` already covers this.

