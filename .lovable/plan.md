

## Plan: Simplify "Registrar Cobro" Modal

### Problem
The modal currently has "Tipo de cobro" (quincenal/mensual) and "Estado" fields that don't match the intended workflow of collecting pending payments from creators. It should focus on: which creator, how much, and a note/detail.

### Changes

**File: `src/pages/finanzas/collections/CollectionsPage.tsx`**

1. **Remove state variables**: Drop `regType` and `regStatus` (lines 52-53), and their reset calls (line 95).

2. **Simplify mutation**: Remove `statusMap` logic; always insert with `status: "enviada"` (pending) and `payment_method: "cobro"`. Store the note in the `notes` field of the invoices table (need to verify this column exists).

3. **Add note state**: Replace `regType`/`regStatus` with a new `regNotes` state variable.

4. **Rewrite modal form** (lines 379-414): Keep "Creadora" selector and "Monto" input. Replace "Tipo de cobro" and "Estado" with a single `Textarea` for notes/detail. Order: Creadora → Monto → Notas.

5. **Update mutation insert**: Add `notes: regNotes` to the insert payload.

### Technical Detail
- The `invoices` table likely has a `notes` column already. Will verify and use it. If not, the field can map to an existing text column or we add a migration.
- No other files affected. Removes ~20 lines of unused form code.

