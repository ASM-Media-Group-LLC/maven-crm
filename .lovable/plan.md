

## Plan: Fix Offboarding Flow from Creators List

### Issues Identified

1. **Sidebar order wrong**: Currently `Dashboard > Onboarding > Offboarding > Listado`. Should follow the user journey: `Dashboard > Listado > Onboarding > Offboarding`.

2. **No link from creators list to offboarding**: When a creator has status "Retiro" (leaving) or "Terminada" (terminated) in the table, there's no visual indicator or action to go to their offboarding process.

3. **Status change to "Retiro" doesn't redirect**: After changing status to `leaving` in `ChangeStatusModal`, the offboarding record is created silently but the user has no way to navigate to it directly.

---

### Changes

#### 1. Reorder sidebar items (`DashboardSidebar.tsx`)

```
Dashboard → Listado → Onboarding → Offboarding
```

#### 2. Add offboarding action in creators table (`CreadoresTable.tsx`)

For creators with status `leaving` or `terminated`, add a `LogOut` icon button in the actions column that navigates to their offboarding detail page. This requires a quick lookup of the offboarding ID by creator ID (can use the existing `creator_offboardings` table).

#### 3. Add navigation after status change (`ChangeStatusModal.tsx`)

When status is changed to `leaving` and the offboarding record is created successfully, show a toast with an action button "Ver Offboarding" that navigates to the offboarding detail page. This requires `createOffboardingRecord` to return the new offboarding ID.

#### 4. Update `createOffboardingRecord` in `useOffboarding.ts`

Change it to return the created offboarding record ID so `ChangeStatusModal` can link to it.

---

### Files Summary

| Action | File |
|--------|------|
| Modify | `src/components/dashboard/DashboardSidebar.tsx` — reorder items |
| Modify | `src/pages/creadores/CreadoresTable.tsx` — add offboarding link for leaving/terminated creators |
| Modify | `src/pages/creadores/ChangeStatusModal.tsx` — navigate to offboarding after creating it |
| Modify | `src/pages/creadores/useOffboarding.ts` — return ID from `createOffboardingRecord` |

