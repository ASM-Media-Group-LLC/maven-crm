

# Multi-Select Filters for Creadora and Document ID

## Overview
Convert the Creadora and Document ID filters from single-select dropdowns to multi-select using Popover + Checkbox lists. This allows selecting multiple creators and/or multiple document IDs simultaneously.

## Changes

### 1. `src/pages/SalesPerformanceCreator.tsx`
- Change `creatorFilter` state from `string` to `string[]` (initialized to `[]`, where empty means "all")
- Change `documentFilter` state from `string` to `string[]` (initialized to `[]`)
- Update filtering logic in the `filtered` memo:
  - Creator: if array is non-empty, check if `artistic_name` or `pending_creator` is included in the array
  - Document: if array is non-empty, check if `document_id` is included in the array
- Update handler functions to work with arrays

### 2. `src/pages/sales-performance/EarningsFilters.tsx`
- Update props interface:
  - `creatorFilter: string[]` and `onCreatorFilterChange: (value: string[]) => void`
  - `documentFilter: string[]` and `onDocumentFilterChange: (value: string[]) => void`
- Replace both `Select` components with `Popover` + scrollable checkbox lists:
  - Trigger button shows count of selected items (e.g., "2 selected") or "Todas"/"Todos" when empty
  - Content: a scrollable list of `Checkbox` items for each option
  - Each checkbox toggles its value in/out of the array
  - A "Limpiar" (clear) button at the top to reset to empty (all)
- Import `Checkbox` from `@/components/ui/checkbox` and `ScrollArea` from `@/components/ui/scroll-area`

### No new files or dependencies needed
Uses existing `Popover`, `Checkbox`, `ScrollArea`, and `Button` components already in the project.

## Technical Details

**Updated props interface (EarningsFilters):**
```typescript
interface EarningsFiltersProps {
  documentFilter: string[];
  onDocumentFilterChange: (value: string[]) => void;
  creatorFilter: string[];
  onCreatorFilterChange: (value: string[]) => void;
  // ... rest unchanged
}
```

**Multi-select toggle logic:**
```typescript
const toggleItem = (arr: string[], item: string) =>
  arr.includes(item) ? arr.filter(v => v !== item) : [...arr, item];
```

**Filter logic update (SalesPerformanceCreator):**
```typescript
if (creatorFilter.length > 0) {
  result = result.filter(r =>
    creatorFilter.includes(r.artistic_name ?? "") ||
    creatorFilter.includes(r.pending_creator ?? "")
  );
}
if (documentFilter.length > 0) {
  result = result.filter(r => documentFilter.includes(r.document_id ?? ""));
}
```

**Trigger display:**
- Empty array: "Todas" / "Todos"
- 1 selected: show the name
- 2+ selected: "N seleccionadas"

