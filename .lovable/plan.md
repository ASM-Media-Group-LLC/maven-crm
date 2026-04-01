

## Fix: Template deletion blocked by missing RLS policy

### Root Cause

The `invoice_templates` table has RLS enabled with policies for SELECT, INSERT, and UPDATE — but **no DELETE policy**. Supabase silently returns success with 0 rows affected, so the UI shows a success toast but the template remains.

### Solution

Create a database migration adding a DELETE policy for authenticated users:

```sql
CREATE POLICY "Authenticated can delete templates"
ON public.invoice_templates
FOR DELETE
TO authenticated
USING (true);
```

### Additional Fix

The current `handleDelete` in `TemplatesPage.tsx` doesn't check if the deletion actually affected rows. We should also verify the `error` response properly — though the main fix is the RLS policy.

### Files to modify

| Change | Detail |
|--------|--------|
| **Migration** (new) | Add DELETE policy on `invoice_templates` |

No code changes needed — the existing `handleDelete` logic is correct once RLS allows the operation.

