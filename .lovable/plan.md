

## Plan: Messenger Audit, Performance Fixes & Drag-and-Drop

### 1. Guarantee 350MB File Uploads

**Current state**: The Supabase bucket `chat-files` already has `file_size_limit = 367001600` (350MB). The client-side validation in `MessageInput.tsx` is correctly set to `MAX_FILE_SIZE_MB = 350`.

**Fixes needed**:
- **Upload progress feedback for large files**: Currently uses a simple text status. For 350MB files, uploads can take minutes with no real progress. Add a percentage-based progress bar using `XMLHttpRequest` with `upload.onprogress` instead of the Supabase SDK's `.upload()` (which doesn't expose progress). Alternatively, keep the SDK but add elapsed time and file size display so users know it's working.
- **Upload timeout resilience**: Add abort controller support so users can cancel stuck uploads. Show a cancel button during upload.
- **Chunked validation UX**: Show individual file sizes in the pending files preview so users can identify oversized files before hitting send.

### 2. Sync Actions & Fix Delays

**Findings from audit**:

- **Reactions `refreshReactions`**: On every realtime INSERT/DELETE event, it re-fetches ALL reactions for ALL messages in the conversation. For a conversation with 500 messages, this is excessive.
  - **Fix**: Instead of full refresh, apply the realtime payload directly -- on INSERT, append the new reaction; on DELETE, remove it by matching the old payload. Only fall back to full refresh on error.

- **`loadConversations` over-triggering**: The realtime handler calls `scheduleConversationsReload()` on message UPDATE and DELETE events, which triggers a full reload of all conversations. 
  - **Fix**: For message UPDATE/DELETE, only update the affected conversation's `lastMessage` inline instead of full reload. Reserve full reload for participant and conversation-level changes only.

- **Read receipts `loadReceipts`**: Loads receipts for only the last 50 messages, which is fine, but the realtime channel listens globally on `chat_read_receipts` without filtering by conversation.
  - **Fix**: No change needed -- the `trackedMessageIds` filter handles this efficiently.

### 3. Drag-and-Drop File Attach

**Implementation**: Add drag-and-drop support to the `ChatView` component (wrapping the entire chat area) that feeds dropped files into the existing `MessageInput` pending files system.

- Add `onFilesDropped` prop to `MessageInput` and expose a method/callback to accept external files.
- Wrap the chat area in `ChatView` with drag event handlers (`onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop`).
- Show a visual drop overlay ("Suelta archivos aquí") when dragging files over the chat.
- Reuse the existing file validation logic (max 20 files, max 350MB each).

### Files to modify

| File | Changes |
|------|---------|
| `src/hooks/useReactions.ts` | Apply realtime payloads inline instead of full refresh |
| `src/hooks/useChat.ts` | Reduce unnecessary `loadConversations` calls on message UPDATE/DELETE |
| `src/pages/messenger/components/MessageInput.tsx` | Add cancel upload button, file size display, expose `addFiles` for drag-and-drop |
| `src/pages/messenger/ChatView.tsx` | Add drag-and-drop overlay and handlers, pass dropped files to MessageInput |
| `src/pages/messenger/components/MessageList.tsx` | Pass through drag events (no drop interference) |

