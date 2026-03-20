

## Plan: Server-side Pagination for LeadGen + Closers Performance Fix + Data Verification

### Current Problems

1. **LeadGen main page with "Todo" filter**: Fetches ALL 80k+ rows in a while-loop, freezing the UI.
2. **LeadGen Base de Datos page**: `useLeadGenEntries()` fetches ALL 80k+ rows at once into memory.
3. **Closers status counts**: `SELECT stage FROM closer_creators` returns 80k+ rows just to count them — should use a server-side count query.
4. **Data verification**: Closers data IS correctly synced from LeadGen (confirmed: `instagram_handle` = `model_handle`, `source_account` = `company`, `category` = `quality`, all linked via `leadgen_entry_id`). No mock data — all 80,942 rows are real.

### Changes

**1. `src/pages/leadgen/useLeadGen.ts` — Add server-side pagination to main page query**
- Change `fetchEntriesByDateRange` to accept `page` and `pageSize` params
- Use `.range()` with `{ count: "exact" }` instead of the while-loop
- Return `{ data, total }` instead of a flat array
- Update `useLeadGenByDateRange` hook signature to include pagination params
- Keep the while-loop version ONLY for `fetchAllEntries` (Base de Datos) but convert that to server-side pagination too (see point 2)

**2. `src/pages/leadgen/useLeadGen.ts` — Convert Base de Datos to server-side pagination**
- Change `useLeadGenEntries` to accept `page` and `pageSize` (default 100)
- Use `.range()` with `{ count: "exact" }` — single query, no while-loop
- Return `{ data, total }`

**3. `src/pages/leadgen/LeadGenContent.tsx` — Add pagination UI to leads tab**
- Add `page` state (default 0), pass to `useLeadGenByDateRange`
- Reset page to 0 when filters change
- Show pagination controls (reuse `EarningsPagination` component) below the table
- Display total count from server response

**4. `src/pages/leadgen/LeadGenBaseDatosContent.tsx` — Add pagination**
- Add `page` state, pass to updated `useLeadGenEntries`
- Add `EarningsPagination` below the table
- Remove client-side date filtering (move to server-side via the query)
- Keep client-side search as complementary filter

**5. `src/pages/closers/hooks/useCloserLeads.ts` — Fix status counts query**
- Replace `SELECT stage` (returns 80k rows) with a database RPC or grouped count query
- Create a simple SQL function `get_closer_stage_counts` that returns `stage, count` grouped
- OR use multiple `.select('id', { count: 'exact', head: true }).eq('stage', X)` queries (simpler, no migration needed)

**6. Database migration — Create count function for closers**
```sql
CREATE OR REPLACE FUNCTION public.get_closer_stage_counts(_user_id uuid, _is_admin boolean)
RETURNS TABLE(stage text, cnt bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT cc.stage, COUNT(*) as cnt
  FROM public.closer_creators cc
  WHERE _is_admin OR cc.assigned_to = _user_id
  GROUP BY cc.stage;
$$;
```

### Files Modified
- `src/pages/leadgen/useLeadGen.ts` — server-side pagination for both hooks
- `src/pages/leadgen/LeadGenContent.tsx` — pagination state + UI
- `src/pages/leadgen/LeadGenBaseDatosContent.tsx` — pagination state + UI
- `src/pages/closers/hooks/useCloserLeads.ts` — use RPC for counts
- New DB migration — `get_closer_stage_counts` function

### Impact
- Main LeadGen page: 1 query of ~100 rows instead of 80+ queries of 1000 rows
- Base de Datos: 1 query of ~100 rows instead of 80+ queries
- Closers counts: 1 query returning ~4 rows instead of 80k rows

