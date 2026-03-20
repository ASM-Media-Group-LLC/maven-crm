

## Plan: Add Conversation Controls to Thread Panel + Audit

### Problem
The ThreadPanel only supports plain text + mentions. The main conversation has: reactions, message actions (reply, copy, edit, delete), emoji picker, file attachments, voice notes, read receipts, and file/image rendering. None of these work in threads.

### Changes

**1. ThreadPanel.tsx — Add message controls to each reply**
- Import and add `ReactionPicker`, `ReactionsDisplay`, `ReadReceiptIndicator` to each reply message
- Add hover action bar (same as MessageBubble): reaction picker + dropdown menu with Copy, Edit (own messages), Delete (own messages)
- Render file/image/video/voice content in replies (currently only renders text)
- Add new props: `onEditReply`, `onDeleteReply`, `getReactionsForMessage`, `onToggleReaction`, `getReadByUsers`, `totalParticipants`

**2. ThreadPanel.tsx — Upgrade input area to match MessageInput**
- Add emoji picker button (Popover with EMOJIS grid, same as MessageInput)
- Add file attachment button + file upload logic (reuse same TUS upload pattern from MessageInput)
- Add voice note recording support (VoiceNoteRecorder)
- Add reply-to support within the thread (optional, lower priority)
- Update `onSendReply` signature to accept `(content, type?, fileUrl?, fileName?)` to support files

**3. ChatView.tsx — Wire new thread callbacks**
- Pass `onEditMessage`, `onDeleteMessage`, `getReactionsForMessage`, `onToggleReaction`, `getReadByUsers`, and `conversation.participants.length` to ThreadPanel
- Update `handleSendThreadReply` to forward file parameters

**4. Audit & cleanup**
- Remove unused `ScrollArea` import from ThreadPanel (imported but never used)
- Remove duplicate `getInitials` and `formatTime` functions that exist in both ThreadPanel and MessageBubble — extract to a shared `utils` file in the messenger module
- Check for any other orphan imports across messenger components

### Files Modified
- `src/pages/messenger/components/ThreadPanel.tsx` — major refactor: add reactions, message actions, emoji picker, file upload, voice notes, media rendering
- `src/pages/messenger/ChatView.tsx` — pass additional props to ThreadPanel
- `src/pages/messenger/utils.ts` (new) — shared `getInitials`, `formatTime`, `formatDate` helpers
- `src/pages/messenger/components/MessageBubble.tsx` — import shared helpers instead of local duplicates

