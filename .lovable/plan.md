

## Plan: Clean Remaining Test Data & Clarify Closers Data Flow

### Root Cause
The previous migration only deleted `leadgen_entries` matching `team_%`. There are **39 more test records** from October 2025 with status `interested`/`meeting_set` that the Closers "Todas" tab pulls in as "Pendiente LG". All have fake user IDs (`11111111-...`, `55555555-...`, `aaaaaaaa-...`, etc.) and fake handles (`pepe_*`, `@modelo_*`, `@m_*`, `luna_l`, `sofia_star`, `dany_blue`, `mia_moon`).

### How Closers Works (current flow)
1. **Converted leads** → stored in `closer_creators` table (e.g., `@marielby`). These appear in Asignadas/Confirmadas/Completadas tabs.
2. **"Pendiente LG" items** → the "Todas" tab also fetches `leadgen_entries` with status `interested` or `meeting_set` that haven't been converted yet. This is meant to show leads ready to be closed. But right now it's only showing test data.

### Changes

**1. SQL Migration — Delete all remaining test data**
Delete all leadgen_entries from October 2025 that have fake user IDs (the `11111111-...`, `22222222-...`, `55555555-...`, `88888888-...`, `99999999-...`, `aaaaaaaa-...` pattern). This covers all remaining seed records including `pepe_*`, `@modelo_*`, `@m_*`, `luna_l`, `sofia_star`, `dany_blue`, `mia_moon`.

Specifically:
```sql
DELETE FROM public.leadgen_entries
WHERE lg_user_id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555',
  '88888888-8888-8888-8888-888888888888',
  '99999999-9999-9999-9999-999999999999',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
```

Also delete the remaining `pepe_*`, `luna_l`, `sofia_star`, `dany_blue`, `mia_moon` entries that have real-looking user IDs but are still test data:
```sql
DELETE FROM public.leadgen_entries
WHERE entry_date <= '2025-10-15'
  AND model_handle IN ('pepe_a_1','pepe_a_2','pepe_a_3','pepe_a_4','pepe_a_5','pepe_a_6','pepe_a_7',
    'pepe_aplus_1','pepe_aplus_2','pepe_aplus_3','pepe_aplus_4','pepe_aplus_5',
    'pepe_b_2','pepe_bplus_1','pepe_bplus_2','pepe_bplus_4',
    'luna_l','sofia_star','dany_blue','mia_moon');
```

**2. No code changes needed** — The Closers data flow is correct:
- Leads generated in LeadGen that reach `interested`/`meeting_set` status appear in Closers "Todas" tab as "Pendiente LG"
- From there, admins can assign them to a closer, which converts them into a `closer_creators` record
- Once converted, they move through the pipeline: Asignada → Confirmada → Completada

After cleanup, the Closers module will be clean — only showing the 1 real converted lead (`@marielby`) and any future real leads from LeadGen.

### Files Modified
- New SQL migration (delete remaining test data)

