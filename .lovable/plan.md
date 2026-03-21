

## Plan: Fix LeadGen, Closers, and Promolog table layouts

### Root causes identified

**LeadGen — double scroll**: The KPIs, tabs, and filters are wrapped in a `div` with `maxHeight: "45vh"` and `overflow-auto` (line 235). This creates an independent scrollable area above the table. The user scrolls within that box to see filters, then scrolls separately inside the table. Fix: remove the scrollable wrapper, make KPIs/tabs/filters `shrink-0`, let only the table area flex.

**Closers — table invisible**: Radix `TabsContent` renders as a block element. Even with `flex-1 min-h-0 flex flex-col` classes, the hidden/shown behavior of TabsContent doesn't participate in flex stretch properly. The parent `div.flex-1.min-h-0.flex.flex-col` contains multiple `TabsContent` elements but only one is visible, and it doesn't fill height. Fix: replace `TabsContent` usage for the table area with conditional rendering (`{activeTab === tab.value && ...}`), which avoids the Radix layout limitation entirely.

**Promolog — everything scrolls together**: Line 442 has `flex-1 overflow-auto p-6 space-y-6` wrapping ALL content (KPIs + social cards + tabs + table). The DataTableShell can't establish its own flex context inside a single scrollable div. Fix: split into `shrink-0 overflow-auto` for KPIs/social/tabs/filters (with a max-height cap) and `flex-1 min-h-0` for the table area.

**Contactos** — user confirmed it works, no changes.

### Changes

#### 1. LeadGenContent.tsx
- Remove the `<div className="shrink-0 overflow-auto" style={{ maxHeight: "45vh" }}>` wrapper (line 235)
- Make the KPI cards + tab bar + filters bar each `shrink-0` directly inside the main flex column
- Keep `<div className="flex-1 min-h-0 flex flex-col px-6 pb-4">` for tab content unchanged

#### 2. ClosersContent.tsx
- Remove the `{TABS.map(tab => <TabsContent>)}` pattern (lines 199-229)
- Replace with a single div that conditionally renders the DataTableShell based on `activeTab`
- Keep the `Tabs` component only for the header (KPIs + TabsList + filters), not for content switching
- This ensures the table container properly fills `flex-1 min-h-0`

#### 3. PromologContent.tsx
- Split the single `flex-1 overflow-auto p-6 space-y-6` div (line 442) into two sections:
  - `shrink-0 overflow-auto p-6 space-y-6` with a max-height for KPIs + social cards + tab bar + filters
  - `flex-1 min-h-0 flex flex-col px-6 pb-4` for the table/DataTableShell content
- Move the DataTableShell outside the scrollable area so it gets its own flex context

### Files to modify
- `src/pages/leadgen/LeadGenContent.tsx`
- `src/pages/closers/ClosersContent.tsx`
- `src/pages/promolog/PromologContent.tsx`

### Result
- LeadGen: no more double scroll — KPIs/tabs/filters stay fixed at top, only table scrolls
- Closers: table becomes visible and fills available space with pagination below
- Promolog: table gets its own scroll context, pagination visible, sticky headers work

