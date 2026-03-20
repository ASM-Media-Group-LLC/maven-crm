

## Plan: Google Chat-style Search Results Panel

### Current State
Search opens an inline input in ChatHeader and a small `SearchResultsBar` showing "X de Y resultados" with up/down arrows. No list of results is shown — the user navigates blindly.

### New Behavior
When the user types a search query, a side panel (or overlay list) appears showing ALL matching messages grouped by date, with sender name, timestamp, and highlighted snippet. Clicking a result scrolls the main chat to that message and highlights it. The current `SearchResultsBar` (counter + arrows) becomes redundant and will be removed.

### Changes

**1. New component: `SearchResultsPanel.tsx`**
- Side panel (same slot as ThreadPanel/SharedFiles) showing search results
- Input field at top with search icon and close button
- Results listed below, grouped by date (Hoy, Ayer, date)
- Each result shows: sender avatar+name, timestamp, content snippet with keyword highlighted (yellow)
- Click a result → set `highlightedMsgId`, scroll chat to that message, keep panel open
- Empty state and loading spinner
- Result count summary

**2. Update `ChatView.tsx`**
- Remove `SearchResultsBar` usage entirely
- When search is toggled, open `SearchResultsPanel` in the side panel area (same position as thread/shared files/group members — mutually exclusive)
- Close other panels when search opens and vice versa
- Move search state management: query input now lives inside `SearchResultsPanel`, not in `ChatHeader`
- Remove `searchOpen`/`searchQuery` props from `ChatHeader` — the header search button just toggles the panel

**3. Update `ChatHeader.tsx`**
- Remove the inline search bar at the bottom (the `{searchOpen && ...}` block)
- Remove `searchOpen`, `searchQuery`, `onSearchChange` props
- Keep `onSearchToggle` to open/close the panel
- Clean up unused imports (`Input`, `X` if no longer needed)

**4. Delete `SearchResultsBar.tsx`**
- Fully replaced by the new panel — remove file and all imports

**5. Audit & cleanup**
- Remove `searchIndex` state from ChatView (no longer needed — no arrow navigation)
- Remove `handleSearchNavigate` callback
- Remove `SearchResultsBar` import
- Verify `searchQuery` is still passed to `MessageList` for inline text highlighting when a result is selected

### Files Modified
- `src/pages/messenger/components/SearchResultsPanel.tsx` (new) — full results panel
- `src/pages/messenger/ChatView.tsx` — wire new panel, remove old bar, clean state
- `src/pages/messenger/components/ChatHeader.tsx` — remove inline search bar, simplify props
- `src/pages/messenger/components/SearchResultsBar.tsx` (delete)

