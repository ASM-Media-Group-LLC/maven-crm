

## Plan: Fix Offboarding Filters, Header, Approvals & Dashboard Integration

### Issues to Address

1. **Select filters say "Todos/Todas"** — should show placeholder ("Estado", "Categoría") and "Todos" only resets to empty state per established pattern.
2. **Missing date filter and view toggle** (table/grid) on OffboardingListPage.
3. **Detail page header not sticky** — should be fixed while content scrolls.
4. **Approval system is open to anyone** — must restrict to: admins + specific users Luis Carlos Ortega Roman (`41b35cef-...`) and Grace Gelves M. (`8b90f141-...`).
5. **Dashboard already has offboarding metrics** — already integrated in `CreadorasDashboardContent.tsx`. KPI cards in `CreadoresKPICards.tsx` already show "Retiros" and "Terminadas" counts. No changes needed here.

---

### Changes

#### 1. Fix OffboardingListPage filters + add date filter + view toggle (`OffboardingListPage.tsx`)

- Change `statusFilter` and `categoryFilter` default from `"all"` to `""` (empty string).
- Use `value={statusFilter || undefined}` so placeholder shows when empty.
- Dropdown "Todos" option resets to `""`.
- Placeholders: "Estado", "Categoría".
- Add a date range filter (using existing DateRangePicker or simple date select) to filter by `created_at` or `exit_date`.
- Add table/grid view toggle with `List`/`LayoutGrid` icons like other modules.
- Create a simple grid card view for offboardings.

#### 2. Fix OffboardingDetailPage sticky header (`OffboardingDetailPage.tsx`)

- Make the header (back button + creator name + status badge + "Ver Perfil" button) sticky with `sticky top-0 z-10 bg-background border-b`.
- Content below scrolls independently.

#### 3. Restrict approval system (`OffboardingDetailPage.tsx` + `useOffboarding.ts`)

- Define allowed approver IDs: Luis (`41b35cef-82a8-4991-9234-3514b0064767`) and Grace (`8b90f141-8546-4cfd-a358-56ff227623df`).
- In the detail page, only show the "Aprobar Offboarding" button if the current user is an admin OR is one of those two specific users.
- Use `useUserRole` hook to check admin status.
- The `approve` mutation itself should also validate server-side (but for now, UI-level restriction).

---

### Files Summary

| Action | File |
|--------|------|
| Modify | `src/pages/creadores/offboarding/OffboardingListPage.tsx` — fix filters, add date filter, add grid view toggle |
| Modify | `src/pages/creadores/offboarding/OffboardingDetailPage.tsx` — sticky header, restrict approval button |

