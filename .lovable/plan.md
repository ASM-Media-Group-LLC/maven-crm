

## Plan: Upgrade Company Selector in AddLeadModal

### What needs to change

The company/cuenta de origen field in the "Nuevo Lead" modal (lines 345-368 of `AddLeadModal.tsx`) currently uses a basic `Select` with a hardcoded list missing some companies (e.g., "ORA"). It needs:

1. **Add "ORA" (Ora Miami)** to the company list
2. **Replace the basic Select with a searchable Combobox** (Popover + Command pattern, same as the country selector already in this file)
3. **Add "Agregar nueva" option** that lets users type a custom company name inline if it does not exist in the list

### Implementation details

**1. Update `LEADGEN_COMPANIES` in `leadgenConstants.ts`**
- Add `"Ora Miami"` to the list (it is referenced in the constant but the modal has its own hardcoded list — we will unify them)

**2. Refactor company field in `AddLeadModal.tsx` (lines 345-368)**
- Replace the `<Select>` with the same `Popover` + `Command` pattern already used for the country selector (lines 378-403)
- Source the options from `LEADGEN_COMPANIES` constant instead of hardcoded `SelectItem`s
- Add a `CommandInput` for search/filtering
- Add a special "Agregar nueva compañía" `CommandItem` at the bottom that, when selected, shows an inline `Input` to type a custom company name
- Use local state (`customCompany` / `isAddingNew`) to handle the "add new" flow
- When the user types a custom name and confirms, set `field.onChange(customName)` directly

**3. Sync the hardcoded values**
- The modal currently uses different values (`"kash-agency"`, `"blue-app"`, etc.) vs `LEADGEN_COMPANIES` which uses display names (`"KASH Agency"`, `"Blu app"`). We will unify to use the display names from `LEADGEN_COMPANIES` as both value and label (matching existing DB data).

### Files to modify
- `src/pages/leadgen/leadgenConstants.ts` — add "Ora Miami" if not present (it is already there, but ensure consistency)
- `src/pages/leadgen/AddLeadModal.tsx` — replace company Select with searchable Combobox + "add new" option

### Technical notes
- The country selector in the same file already uses the exact Popover+Command+CommandList pattern, so this is consistent with existing code
- The `LEADGEN_COMPANIES` array already contains `"Ora Miami"` — the modal just was not using it
- No DB changes needed; the `company` column is a free-text field

