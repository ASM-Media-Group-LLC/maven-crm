

## Problem

Supabase returns a maximum of **1000 rows** by default per query. The `of_gross_earnings` table has ~1,400 rows per day, so the current fetch only retrieves about 1.5 days of data — that's why you only see March 3 and 4.

## Solution

Paginate the Supabase query to fetch **all rows** across multiple requests of 1000 each, until no more data is returned.

## Changes

**File: `src/pages/sales-performance/useEarningsData.ts`**

Replace the single `.select()` call with a paginated loop:

1. Fetch in batches of 1000 rows using `.range(offset, offset + 999)`
2. Continue fetching until a batch returns fewer than 1000 rows
3. Concatenate all batches before processing (mapping creators, computing effective dates, deduplicating)

This ensures all historical data is loaded regardless of how many rows exist in the table.

