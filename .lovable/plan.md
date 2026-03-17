

## Plan: Add "Iniciar Offboarding" Button + Test Flow

### Problem
The offboarding list page has no way to **initiate** a new offboarding process. Users can only trigger it indirectly by changing a creator's status to "Retiro" from the creator profile. The list page should allow starting an offboarding directly.

### Changes

#### 1. Add "Iniciar Offboarding" button to `OffboardingListPage.tsx`

Add a button in the header area that opens a dialog/modal to select a creator and start their offboarding:

- Button: "Iniciar Offboarding" next to the page title
- Opens a dialog with a searchable creator selector (fetches creators with status `active`, `leaving`, or `paused` who don't already have an active offboarding)
- On confirm: changes creator status to `leaving`, creates the offboarding record, navigates to the detail page
- Reuses `createOffboardingRecord` from `useOffboarding.ts`

#### 2. Create `InitiateOffboardingDialog.tsx` in `src/pages/creadores/offboarding/`

A dialog component that:
- Fetches all creators without an existing active offboarding
- Provides a search/filter input
- Shows a selectable list of creators (name, artistic name, Instagram)
- On "Iniciar": updates creator status to `leaving`, calls `createOffboardingRecord`, navigates to `/creadores/offboarding/:id`

#### 3. Insert test creator via Supabase insert tool

Insert a creator named "Testing Offboarding" with status `active` to use for testing the flow. This will be done as a data operation.

---

### Files Summary

| Action | File |
|--------|------|
| Create | `src/pages/creadores/offboarding/InitiateOffboardingDialog.tsx` |
| Modify | `src/pages/creadores/offboarding/OffboardingListPage.tsx` — add button + dialog |

After implementation, I'll insert a test creator record for you to test the full flow. You'll be able to delete it afterward from the creator profile or directly.

