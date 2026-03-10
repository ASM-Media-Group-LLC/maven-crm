

## Plan: Move Contactos/Agencias tab bar below KPI cards

Currently the tab bar (Contactos | Agencias) is inside the fixed `<header>` block above the scrollable content. It should be moved into the scrollable area, right after the KPI cards.

### File: `src/pages/contactos/ContactosContent.tsx`

1. **Remove the tab bar from the header** (lines 182-197) — remove the `div` with the inline-flex tab buttons from inside `<header>`.

2. **Move tab bar into the scrollable content area**, right after `<ContactosKPICards>` and before `<ContactosFilters>`. The tab bar renders for both tabs, so place it outside the `activeTab === "contactos"` conditional — directly after the KPI cards block:

```
<div className="flex-1 overflow-auto p-6 space-y-6">
  <ContactosKPICards ... />
  
  {/* Tab bar moved here */}
  <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
    <Button ...>Contactos</Button>
    <Button ...>Agencias</Button>
  </div>

  {activeTab === "contactos" ? (
    <>
      <ContactosFilters ... />
      {view === "table" ? <ContactosTable /> : <ContactosGrid />}
    </>
  ) : (
    <AgenciasContent />
  )}
</div>
```

3. **Keep KPI cards always visible** (outside the tab conditional) since they provide overall stats. The header keeps only the title and the action button.

One file changed, just moving ~15 lines of JSX.

