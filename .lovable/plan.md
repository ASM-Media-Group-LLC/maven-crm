

## Plan: Table & Filter Adjustments

### Changes

**1. `src/pages/contactos/ContactosTable.tsx`**
- Rename "Creado por" column header to "Agente"
- Move "Agente" column to 4th position (after Nombre, before Estado)
- Both in `<TableHeader>` and `<TableBody>` rows
- Add `max-w-[180px] truncate` to the Nombre cell to prevent it from taking excessive width

**2. `src/pages/contactos/ContactosFilters.tsx`**
- Replace the Agente `FilterSelect` with a searchable Popover+Command selector (matching the platform pattern from memory)
- Move Agente selector before the DateRangePicker
- Import `Popover`, `PopoverTrigger`, `PopoverContent` from `@/components/ui/popover` and `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem` from `@/components/ui/command`
- The searchable selector shows "Agente" placeholder, allows typing to filter, and includes a "Todos" option to clear

