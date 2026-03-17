

## Problem

The external share links use `window.location.origin` which resolves to the Lovable preview/staging domain (e.g., `id-preview--xxx.lovable.app`). External guests see a "Lovable" URL and may hit auth redirects if the app shell loads before the public route.

## Solution

Add a `VITE_PUBLIC_URL` environment variable set to the production domain (`https://simple-maven-say.lovable.app` or future custom domain), and use it for all external share links instead of `window.location.origin`.

### 1. Add env variable

Add `VITE_PUBLIC_URL` to `.env`:
```
VITE_PUBLIC_URL="https://simple-maven-say.lovable.app"
```

### 2. Create helper

A small utility `src/lib/getPublicUrl.ts`:
```typescript
export const getPublicBaseUrl = () =>
  import.meta.env.VITE_PUBLIC_URL || window.location.origin;
```

### 3. Update all share link generators (4 files)

Replace `window.location.origin` with `getPublicBaseUrl()` in:

- **`LinksTab.tsx`** (line 20) — external sharelink
- **`EventosTable.tsx`** (line 38) — copy sharelink action
- **`EventosGrid.tsx`** (line 30) — copy sharelink action
- **`SharedAgendaPage`** if it generates links (will check)

Internal links can keep `window.location.origin` since they're for authenticated users.

### 4. Verify EventoSharePage is truly public

The route is already outside `ProtectedRoute` — confirmed. The page fetches data via edge function with only `apikey` header (no auth token) — confirmed. No changes needed here.

### Files to modify
- `.env` — add `VITE_PUBLIC_URL`
- `src/lib/getPublicUrl.ts` — new helper
- `src/pages/eventos/detail/LinksTab.tsx` — use helper for external link
- `src/pages/eventos/EventosTable.tsx` — use helper for sharelink copy
- `src/pages/eventos/EventosGrid.tsx` — use helper for sharelink copy

