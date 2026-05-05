
-- Clean up March 2026: delete ALL rows, then re-insert from Excel
DELETE FROM of_gross_earnings WHERE date::date BETWEEN '2026-03-01' AND '2026-03-31';
