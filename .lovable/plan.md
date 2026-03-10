

## Verification: Closer Lead Visibility

### What works correctly
- The closer role has `data_scope: "self"` for LeadGen, so `viewMode = "agent"` and the query filters by `lg_user_id = user.id` -- correct.
- The insert in `AddLeadModal` sets `lg_user_id: user.id` -- correct.
- RLS is disabled on `leadgen_entries`, so there are no RLS blocks on insert or select.

### Bug found: Timezone mismatch on `entry_date`

The `AddLeadModal` insert does **not** set `entry_date` explicitly. It relies on the Postgres default `CURRENT_DATE`, which uses the server timezone: **UTC**.

However, the UI defaults to today's date in **Miami time** (`getMiamiDateStr()` returns `America/New_York`).

**Consequence**: If a closer creates a lead after 8 PM ET (midnight UTC), Postgres stores `entry_date` as the *next day* (UTC), but the UI filters for *today* (Miami). The lead won't appear until the user manually changes the date filter or the next day arrives in Miami time.

### Fix

**`AddLeadModal.tsx`** — Explicitly pass `entry_date` using Miami time in the insert:

```typescript
import { getMiamiDateStr } from "./timezoneUtils";

// In the insert object:
entry_date: getMiamiDateStr(),
```

This is a one-line addition to the insert payload at line ~135. It ensures the stored `entry_date` matches the UI's timezone, so the closer always sees their newly created lead immediately.

No other changes needed — the query logic, permission scoping, and filtering are all correct.

