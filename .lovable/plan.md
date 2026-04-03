

# Proposal: Replace Cron Job with Daily Cleanup

## Current Situation

- Each day generates **~35 snapshots x ~32 creators = ~1,100 rows/day**
- The existing cron job tries to shift dates but has bugs (infinite regression + double-subtraction in frontend)
- The `of_gross_earnings_v2` table duplicates this logic with the same bugs
- The client-side `computeEffectiveDate` adds another layer of date shifting

## Proposed New Approach

**Rule**: For any completed day (yesterday and older), keep only the **last snapshot** per creator. For today, keep everything so you see incrementals in real-time.

### Step 1: Delete the old cron job

Remove the existing cron job that shifts dates. No more date manipulation at all — a row's `date` stays exactly as ingested.

### Step 2: Create a new cron job — "Daily Cleanup"

Runs once daily at **01:30 UTC** (after the last snapshot of the previous day arrives around 00:55). It does:

```sql
-- Delete all but the latest snapshot per creator for yesterday
DELETE FROM of_gross_earnings
WHERE id NOT IN (
  SELECT DISTINCT ON (creator_id) id
  FROM of_gross_earnings
  WHERE date::date = current_date - 1
  ORDER BY creator_id, date DESC
)
AND date::date = current_date - 1;
```

This keeps exactly **1 row per creator per completed day** — the last snapshot with the highest cumulative totals (the final number).

### Step 3: One-time historical cleanup

Run a one-time script to deduplicate all past days the same way — keep only the latest snapshot per creator per day for all dates before today. This will reduce the table from ~30,000+ rows to ~32 rows/day (one per creator).

### Step 4: Simplify client-side code

In `useEarningsData.ts`:
- **Remove** `computeEffectiveDate` function entirely
- **Remove** `subDays` import
- Set `effective_date` to `format(new Date(e.date), "yyyy-MM-dd")` — no date shifting needed since rows keep their original date
- **Remove** `deduplicateByCreatorDay` — no longer needed since the DB guarantees one row per creator per completed day
- **Remove** batch pagination (`BATCH_SIZE` / `while` loop) — with ~32 rows/day instead of ~1,100, the table becomes much smaller

### Step 5: Drop or repurpose `of_gross_earnings_v2`

Since the v2 table was just a deduplicated copy, it is no longer needed. Drop it or stop the v2 cron.

### Step 6: Optional — Intraday view

For today's data (which still has multiple snapshots), the dashboard can show an intraday earnings curve — how earnings grew hour by hour. This is free data you already have.

## Summary of Changes

| Component | Action |
|-----------|--------|
| Old cron job (date shifting) | Delete |
| New cron job (cleanup) | Create — keeps 1 row/creator/day for completed days |
| Historical data | One-time cleanup script |
| `useEarningsData.ts` | Remove `computeEffectiveDate`, `deduplicateByCreatorDay`, simplify fetch |
| `of_gross_earnings_v2` table + function | Drop |
| `refresh_of_gross_earnings_daily()` | Drop |
| `refresh_of_gross_earnings_v2_daily()` | Drop |

## Benefits

- No more date manipulation bugs
- Table size reduced by ~97% (from ~1,100 rows/day to ~32)
- Faster queries, no pagination needed
- Clean data: one authoritative row per creator per day
- Intraday incrementals still visible for today

