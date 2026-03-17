

## Plan: Dedicated Offboarding Page + Sidebar Entry

### Current State

The offboarding details are embedded inside `CreadorProfileContent.tsx` as a collapsible section (`OffboardingSection.tsx`), only visible when a creator has status `leaving` or `terminated`. There is no central place to see **all** active offboardings across creators.

### What We'll Build

**A new `/creadores/offboarding` page** that serves as the central hub for managing all offboarding processes. The creator profile keeps a simplified summary with a link to the full offboarding page.

---

### 1. New Page: `src/pages/creadores/offboarding/OffboardingListPage.tsx`

A table/list view showing all offboarding records with:
- Creator name, artistic name, Instagram
- Status badge (En Proceso, Pendiente Aprobación, Pendiente Cierre, Finalizado)
- Category, exit date
- Approval progress (e.g. "1/2")
- Checklist progress (e.g. "3/5")
- Estimated lost revenue
- Filters: by status, by category
- Click row → navigates to `/creadores/:id` (profile) or opens detail view

### 2. New Page: `src/pages/creadores/offboarding/OffboardingDetailPage.tsx`

Route: `/creadores/offboarding/:offboardingId`

This is where the full management UI lives (moved from `OffboardingSection.tsx`):
- Creator summary card
- Exit information (motivos, categoría, comentarios)
- Approvals management
- Closure checklist
- Financial impact
- Communication generator
- Status changes

Reuses the existing logic from `OffboardingSection.tsx` but as a full page with proper layout.

### 3. Sidebar Update: `DashboardSidebar.tsx`

Add `{ title: "Offboarding", url: "/creadores/offboarding" }` to `creadoresSubItems`.

### 4. Routes Update: `App.tsx`

Add two routes:
- `/creadores/offboarding` → `OffboardingListPage`
- `/creadores/offboarding/:offboardingId` → `OffboardingDetailPage`

**Important**: These must be placed BEFORE the `/creadores/:id` catch-all route.

### 5. Simplify Profile Section: `CreadorProfileContent.tsx`

Replace the full `OffboardingSection` with a compact summary card showing:
- Current offboarding status badge
- Approval progress
- Checklist progress
- "Ver detalles de offboarding →" link that navigates to `/creadores/offboarding/:offboardingId`

### 6. Hook Update: `useOffboarding.ts`

Add a new `useAllOffboardings()` hook for the list page that fetches all offboarding records joined with creator data (name, artistic_name, instagram_handle).

---

### Files Summary

| Action | File |
|--------|------|
| Create | `src/pages/creadores/offboarding/OffboardingListPage.tsx` |
| Create | `src/pages/creadores/offboarding/OffboardingDetailPage.tsx` |
| Modify | `src/pages/creadores/useOffboarding.ts` — add `useAllOffboardings` |
| Modify | `src/components/dashboard/DashboardSidebar.tsx` — add submenu item |
| Modify | `src/App.tsx` — add 2 routes |
| Modify | `src/pages/creadores/CreadorProfileContent.tsx` — simplified offboarding summary |
| Keep | `src/pages/creadores/OffboardingSection.tsx` — refactored into detail page |

