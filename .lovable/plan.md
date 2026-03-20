

## Plan: Include File Names in Chat Search

### Problem
When files are uploaded, the search panel only checks `message.content` for matches. If the user typed a custom text with the first file, the actual file name is only stored in `file_name` — invisible to search. Similarly, `file_name` is never checked.

### Changes

**1. `src/pages/messenger/components/SearchResultsPanel.tsx`** — Expand search filter
- Line 51: Change filter to also search in `m.file_name` alongside `m.content`
- In the results display, show the file name as secondary text when it matches the query (with highlighting)

**2. `src/pages/messenger/components/MessageInput.tsx`** — Ensure file name is always in content
- Line 316: When user typed custom text AND is sending a file, append the file name to the content so it's always searchable in `content` field too. Format: `"user text\n📎 filename.pdf"` for the first file with text, keep `pf.file.name` for files without text.

### Files Modified
- `src/pages/messenger/components/SearchResultsPanel.tsx` — search filter + display
- `src/pages/messenger/components/MessageInput.tsx` — content includes file name

