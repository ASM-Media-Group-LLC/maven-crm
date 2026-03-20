

## Plan: Fix tables in Closers, Contactos, and LeadGen pagination

### Root cause analysis

**Why sticky headers don't work in Closers/Contactos:**
The previous fix removed the internal `max-h` + `overflow-auto` from the table wrappers in ContactosTable and LeadTable, delegating scroll to parent flex containers. But `sticky top-0` only works relative to the nearest scrolling ancestor. With the scroll on a distant parent (and intermediate flex wrappers, Radix TabsContent), the sticky positioning breaks. LeadGen works because it has `max-h-[calc(100vh-24rem)] overflow-auto` directly on its table wrapper div.

**Why Closers table is invisible:**
The `TabsContent` with `flex-1 flex flex-col min-h-0` inside a `flex-1 flex flex-col overflow-hidden` parent likely collapses because Radix TabsContent doesn't naturally participate in flex stretch without explicit height.

**Why LeadGen pagination is cut off:**
The table has `max-h-[calc(100vh-24rem)]` which is ~`100vh - 384px`. But the KPIs, tabs, and filters above it already take ~400px+, so the table + pagination below it exceeds the viewport. The outer `overflow-auto` div scrolls, but the user has to scroll past the table's internal scroll area to see the pagination — confusing UX.

### Fix strategy: match LeadGen pattern exactly, then fix LeadGen pagination

#### 1. ContactosTable.tsx (line 87)
Add `max-h-[calc(100vh-20rem)] overflow-auto` to the table wrapper div so it has its own scroll context:
```
<div className="max-h-[calc(100vh-20rem)] overflow-auto rounded-lg border border-border">
```

#### 2. LeadTable.tsx (line 821)
Same fix — add internal scroll:
```
<div className="max-h-[calc(100vh-20rem)] overflow-auto rounded-lg border border-border">
```

#### 3. ContactosContent.tsx (line 292)
Remove `overflow-auto` from the table's parent wrapper. Change `flex-1 min-h-0 overflow-auto` to `flex-1 min-h-0`:
```
<div className="flex-1 min-h-0">
```

#### 4. ClosersContent.tsx (line 197-200)
Simplify the content wrapper. Remove `overflow-hidden` from the outer div and `overflow-auto` from the inner div. The table manages its own scroll:
```tsx
<div className="flex-1 px-6 py-4">
  {TABS.map((tab) => (
    <TabsContent key={tab.value} value={tab.value} className="mt-0">
      <CloserTable ... />
      <div className="flex items-center justify-between mt-3">
        {/* pagination */}
      </div>
    </TabsContent>
  ))}
</div>
```

#### 5. LeadGenTable.tsx (line 241)
Reduce `max-h` so the pagination is visible below the table without needing to scroll the outer container:
```
<div className="max-h-[calc(100vh-28rem)] overflow-auto rounded-lg border border-border">
```

### Files modified
- `src/pages/contactos/ContactosTable.tsx` — add internal scroll wrapper
- `src/pages/closers/components/LeadTable.tsx` — add internal scroll wrapper
- `src/pages/contactos/ContactosContent.tsx` — remove parent overflow-auto
- `src/pages/closers/ClosersContent.tsx` — simplify flex wrappers
- `src/pages/leadgen/LeadGenTable.tsx` — reduce max-h for pagination visibility

