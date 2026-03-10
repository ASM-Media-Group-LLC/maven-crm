

## Restructure Closers Layout: KPI Cards Above Tabs

### What Changes
Move the KPI stats cards **out of the Dashboard tab** and place them **above the tab bar** as a persistent summary -- matching the module-layout-standard used in Contactos, Creadores, etc.

### Changes to `ClosersContent.tsx`

1. **Remove the "Dashboard" tab** entirely (remove `TabsTrigger` for "dashboard" and its `TabsContent`)
2. **Remove the `ClosersDashboard` import** (no longer needed as a separate tab)
3. **Place `<ClosersKPICards creators={creators} />` above the `<Tabs>` component** inside the scrollable content area
4. Set `defaultValue` to `"mis-creators"` instead of `"dashboard"`

The resulting layout order inside the scroll area:
```
ClosersKPICards (always visible)
  ↓
TabsList (Mis Creators | Pipeline | Confirmadas | Completadas | No Interesadas | Asignación)
  ↓
TabsContent (filters + table for selected tab)
```

### Files
- **Edit**: `src/pages/closers/ClosersContent.tsx` -- move KPI cards above tabs, remove Dashboard tab
- **Delete**: `src/pages/closers/tabs/ClosersDashboard.tsx` -- no longer needed

