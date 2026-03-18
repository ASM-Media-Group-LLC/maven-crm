

## Plan: Enlarge Host Hub Pop-up Window

### Change

In `src/pages/cowork/CoworkHostDashboard.tsx` line 423, increase the pop-up dimensions:

- **Width**: `w-80 md:w-96` → `w-96 md:w-[480px]` (from 320/384px to 384/480px)
- **Height**: `280px` → `380px`

Single line change. No other files affected.

