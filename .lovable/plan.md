

## Plan: Add Clipboard Paste Support for Images in Chat

### Problem
The MessageInput textarea has no `onPaste` handler. When a user pastes an image from their clipboard (e.g., a screenshot via Ctrl+V / Cmd+V), nothing happens — the image is silently discarded.

### Solution
Add an `onPaste` event handler to the `<Textarea>` in `MessageInput.tsx` that intercepts clipboard events, extracts image files from `clipboardData.items`, and feeds them into the existing `addFilesInternal()` pipeline (same as drag-and-drop and file picker).

### Changes (single file)

**`src/pages/messenger/components/MessageInput.tsx`**
1. Add a `handlePaste` callback that:
   - Reads `e.clipboardData.items` for items with `type.startsWith("image/")`
   - Converts each to a `File` via `.getAsFile()`
   - Names pasted files with a timestamp (e.g., `pasted-image-1710000000000.png`)
   - Calls `addFilesInternal(files)` to add them to the pending files queue
   - Calls `e.preventDefault()` only when images are found (so normal text paste still works)
2. Attach `onPaste={handlePaste}` to the `<Textarea>` element

No other files need changes — the existing upload, preview, and send pipeline already handles image files from `pendingFiles`.

