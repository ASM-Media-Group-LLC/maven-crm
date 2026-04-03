
-- Step 1: Drop the old date-shifting functions
DROP FUNCTION IF EXISTS public.refresh_of_gross_earnings_daily();
DROP FUNCTION IF EXISTS public.refresh_of_gross_earnings_v2_daily();

-- Step 2: Drop the v2 table (it was just a deduplicated copy)
DROP TABLE IF EXISTS public.of_gross_earnings_v2;

-- Step 3: One-time historical cleanup — keep only the latest snapshot per creator per day for all past days
DELETE FROM public.of_gross_earnings
WHERE date::date < current_date
  AND id NOT IN (
    SELECT DISTINCT ON (COALESCE(creator_id::text, pending_creator, id::text), date::date) id
    FROM public.of_gross_earnings
    WHERE date::date < current_date
    ORDER BY COALESCE(creator_id::text, pending_creator, id::text), date::date, date DESC
  );

-- Step 4: Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Step 5: Remove old cron jobs if they exist
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
  'cleanup-of-gross-earnings-daily',
  'refresh_of_gross_earnings_daily',
  'refresh_of_gross_earnings_v2_daily'
);

-- Step 6: Create the new daily cleanup cron job at 01:30 UTC
SELECT cron.schedule(
  'cleanup-of-gross-earnings-daily',
  '30 1 * * *',
  $$
  DELETE FROM public.of_gross_earnings
  WHERE date::date = current_date - 1
    AND id NOT IN (
      SELECT DISTINCT ON (COALESCE(creator_id::text, pending_creator, id::text)) id
      FROM public.of_gross_earnings
      WHERE date::date = current_date - 1
      ORDER BY COALESCE(creator_id::text, pending_creator, id::text), date DESC
    );
  $$
);
