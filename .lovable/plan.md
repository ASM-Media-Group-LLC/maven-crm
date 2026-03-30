

## Plan: Rediseñar stats cards de LeadGen + filtrar por usuario

### 1. Fix runtime error
`LeadGenContent.tsx` still references `LeadGenEstadosCard` somewhere (line 418 per error). Remove any remaining reference.

### 2. Rediseñar `LeadGenCantidadCard.tsx`
- Remove the wrapping `<Card>` container — render category buttons, Total, and QA as individual standalone cards in a flat flex/grid row
- Remove the "Cantidad" label/header entirely
- For Total and QA cards: fix text overlap by stacking label above value vertically instead of side-by-side in a cramped container
- Each element gets its own card-like styling with proper spacing

### 3. Stats filtradas por usuario (agentes/closers ven su propio rendimiento)
- Add optional `userId` param to `useLeadGenSummaryStats(dateFrom, dateTo, userId?)` — when provided, filter by `lg_user_id`
- In `LeadGenContent.tsx`, pass `user?.id` when `viewMode === "agent"` so agents see only their own stats in the cards

### Archivos a modificar
- `src/pages/leadgen/LeadGenCantidadCard.tsx` — rediseño visual completo
- `src/pages/leadgen/LeadGenContent.tsx` — remove LeadGenEstadosCard reference, pass userId to summary stats
- `src/pages/leadgen/useLeadGen.ts` — add userId filter to `useLeadGenSummaryStats`

