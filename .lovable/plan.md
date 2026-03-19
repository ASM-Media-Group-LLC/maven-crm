

## Plan: Make Cowork Module Standalone (Remove HRLayout Wrapper)

### Problem
The Cowork module is currently wrapped in `HRLayout` (sidebar + topbar), making it look like part of the main app. The user wants it to be a standalone, full-screen module — separate from the main navigation chrome.

### Change

**File: `src/App.tsx` (line 175)**
- Remove the `<HRLayout>` wrapper from the Cowork route, making it render standalone like `VideoCallPage` does:
```tsx
// BEFORE
<Route path="/cowork" element={<ProtectedRoute><HRLayout><CoworkPage /></HRLayout></ProtectedRoute>} />

// AFTER
<Route path="/cowork" element={<ProtectedRoute><CoworkPage /></ProtectedRoute>} />
```

**File: `src/pages/cowork/CoworkPage.tsx`**
- Change `h-full` to `h-screen` on the landing, loading, and ended state containers so they fill the viewport without relying on a parent layout.

No other files affected. No orphan code introduced.

