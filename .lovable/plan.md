

## Plan: Fix Agent Selector, Assign Button & Category Select Issues

### Issues Found

1. **Repeated "Agente" in performance selector** (`LeadGenPerformanceView.tsx` line 27): When profiles lack `full_name`, they all get the fallback name `"Agente"`. The `CommandItem` component filters by text value, so all these entries look identical. Fix: use a truncated user ID as fallback instead.

2. **Assign button in Closers header doesn't work** (`ClosersContent.tsx` line 69): The header "Asignar" button sets `id: ""`, but `AssignCloserDialog` returns `null` when `creatorId` is falsy (`if (!creatorId) return null`). The header button should open the dialog in a "select creator first" mode, or the dialog should allow empty `creatorId` for a general assignment flow. Fix: change the dialog to accept `creatorId` as empty string and show a creator selector when no specific creator is provided.

3. **"Pendiente LG" showing in Closers** — This is intentional by design: the "todas" tab merges unconverted LeadGen entries with stage "Pendiente LG". These are leads from LeadGen that haven't been converted yet. The label and color exist for this purpose. However, the `InlineStageSelect` dropdown for these rows should NOT show "Pendiente LG" as a selectable option (and it doesn't — `CLOSER_STAGES` excludes it). The badge display is correct. **No change needed** unless the user wants to remove these rows entirely.

4. **Category select opens horizontally** — The `InlineCategorySelect` uses `side="bottom"` on the Popover, and the content is `flex flex-wrap` which makes badges horizontal. The user wants a vertical dropdown. Fix: change the layout from `flex flex-wrap` to `flex flex-col` inside the popover.

---

### Changes

#### 1. Fix agent name fallback (`LeadGenPerformanceView.tsx`)
- Line 27: Change `"Agente"` fallback to `"Agente " + id.slice(0, 6)` to make entries unique and identifiable.

#### 2. Fix header Assign button (`ClosersContent.tsx` + `AssignCloserDialog.tsx`)
- In `AssignCloserDialog.tsx`: Remove the `if (!creatorId) return null` guard. When `creatorId` is empty, show an additional creator search/select step before the closer selector.
- Alternative simpler fix: Change the header button to not open the dialog when no creator is selected, and instead show a toast saying "Selecciona una creator primero". But this defeats the purpose of the button.
- Best approach: Make `AssignCloserDialog` work in two modes — with a specific creator (current behavior) or without one (adds a creator search step). When a creator is selected from the search, set it internally, then proceed to closer assignment.

#### 3. Fix category select direction (`LeadTable.tsx`)
- Line 140: Change `<div className="flex flex-wrap gap-1.5">` to `<div className="flex flex-col gap-1">` for vertical layout.

---

### Files Summary

| Action | File |
|--------|------|
| Modify | `src/pages/leadgen/LeadGenPerformanceView.tsx` — unique agent fallback names |
| Modify | `src/pages/closers/components/AssignCloserDialog.tsx` — support empty creatorId with creator search |
| Modify | `src/pages/closers/components/LeadTable.tsx` — vertical category dropdown |

