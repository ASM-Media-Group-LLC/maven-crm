

# Plan: Fix Timezone Shift in Event Dates Display

## Problem
The database correctly stores `date: 2026-04-24`, but all display code uses `new Date(e.date)` which parses `"2026-04-24"` as **UTC midnight**. In Miami timezone (UTC-4), this becomes **April 23 at 8:00 PM**, causing dates to appear one day earlier.

This is the exact pattern documented in our project memory: **append `T12:00:00` to DB ISO date strings before parsing**.

Only `EventoSharePage.tsx` already does this correctly. All other files are affected.

## Changes

Apply `new Date(e.date + "T12:00:00")` everywhere `new Date(e.date)` is used:

### 1. `src/pages/eventos/EventosTable.tsx`
- Line 139: `new Date(e.date)` → `new Date(e.date + "T12:00:00")`
- Line 140: `new Date(e.date)` → `new Date(e.date + "T12:00:00")`
- Line 48: clipboard format date

### 2. `src/pages/eventos/EventosGrid.tsx`
- Line 40: clipboard format
- Line 124: display date

### 3. `src/pages/eventos/EventosCalendar.tsx`
- Lines 41, 42, 44, 47, 47, 133: all `new Date(e.date)` calls

### 4. `src/pages/eventos/ViewEventoModal.tsx`
- Lines 61, 147, 160: all `new Date(event.date)` calls

### 5. `src/pages/eventos/EventoDetailPage.tsx`
- Line 79: `new Date(event.date)` call

### 6. `src/pages/eventos/SharedAgendaPage.tsx`
- Line 125: `new Date(e.date)` in filter

### 7. `src/pages/eventos/NuevoEventoForm.tsx` (edit mode load)
- Line 69: `parse(event.date, "yyyy-MM-dd", new Date())` — this uses `date-fns` parse which is local-timezone safe, so no change needed here.

## Summary

| File | Lines affected |
|------|---------------|
| `EventosTable.tsx` | 3 occurrences |
| `EventosGrid.tsx` | 2 occurrences |
| `EventosCalendar.tsx` | ~6 occurrences |
| `ViewEventoModal.tsx` | 3 occurrences |
| `EventoDetailPage.tsx` | 1 occurrence |
| `SharedAgendaPage.tsx` | 1 occurrence |

No database changes. Pure string concatenation fix: `e.date` → `e.date + "T12:00:00"`.

