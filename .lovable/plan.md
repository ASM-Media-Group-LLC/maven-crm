

# Update March Earnings from Excel Report

## What This Does

Replace all March 2026 data in `of_gross_earnings` with the data from your uploaded Excel file ("Reporte_de_ventas_Marzo_KASH-3.xlsx"). This ensures the database matches the official OF report exactly, including March 25 which is currently missing from the DB.

## Data Summary

- **Excel file**: ~2,016 rows covering March 1-31, 2026 with ~65 creators per day
- **Current DB**: March data exists but is missing March 25 entirely, and may have stale/incorrect values from the old cron job bug
- **Creator matching**: Excel uses creator names (e.g., "Berenaa", "Franundurraga ELITE 20K 40K") which match the `pending_creator` field in the DB. Existing `creator_id` mappings will be preserved where possible.

## Implementation Steps

### Step 1: Delete existing March 2026 data
Remove all rows from `of_gross_earnings` where `date::date` is between 2026-03-01 and 2026-03-31 to avoid duplicates.

### Step 2: Parse and insert Excel data
Write a Python script that:
1. Reads the Excel file with pandas
2. Maps each "Creator" name to an existing `creator_id` (by matching against `pending_creator` in historical data or `artistic_name` in the `creators` table)
3. Parses monetary values (removes `$` and `,`), percentages, and integers
4. Inserts all ~2,016 rows into `of_gross_earnings` with:
   - `date` set to each row's date at `00:00:00` (one clean row per creator per day)
   - `pending_creator` set to the Excel's "Creator" column
   - `creator_id` mapped where possible
   - All financial and metric columns populated

### Step 3: Verify
Query the DB to confirm row counts per day match the Excel and spot-check a few creators' totals.

## Technical Details

- **Columns mapped from Excel**: `subscription_gross`, `new_subscriptions_sub_gross`, `recurring_sub_gross`, `tips_gross`, `total_earnings_gross`, `contribution`, `of_ranking`, `following`, `fans_renew_on`, `renew_on_percentage`, `new_fans`, `active_fans`, `change_expired_fan_count`, `message_gross`, `creator_group`, `avg_spend_per_spender_gross`, `avg_spend_per_transaction_gross`, `avg_earnings_per_fan_gross`, `avg_subscription_length`
- **No code changes needed** — the frontend already reads from `of_gross_earnings` with the simplified logic from the previous fix
- **Database operations**: DELETE (March data) + INSERT (Excel data) via the insert tool

