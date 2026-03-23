

## Plan: Messenger Module M3 Redesign + Thread Fix + Code Cleanup

### Problem
1. **Thread panel cuts off**: At 1311px viewport, sidebar (320px) + chat area + thread panel (380px) overflow. The thread panel gets clipped on the right edge.
2. **Inconsistent M3 styling**: While some M3 patterns exist, the module lacks cohesive Material You polish across all components.
3. **Orphan/duplicate code**: TUS upload logic is duplicated in both `MessageInput.tsx` and `ThreadPanel.tsx` (~180 lines each). `formatFileSize` is defined in 3 places. `ThreadPanel` re-implements message rendering instead of reusing `MessageBubble`.

### Solution

#### Phase 1: Fix Thread Panel Overflow (Critical Bug)
**File: `ChatView.tsx`**
- Change side panels (Thread, Search, SharedFiles, GroupMembers) from `sm:relative` siblings in a flex row to **overlay panels** that float on top of the chat area on all screen sizes
- Use `absolute right-0 inset-y-0` with a backdrop shadow instead of adding width to the flex container
- This prevents the combined width from exceeding the viewport

**Files: `ThreadPanel.tsx`, `SearchResultsPanel.tsx`, `SharedFilesGallery.tsx`, `GroupMembersPanel.tsx`**
- Remove `sm:relative sm:inset-auto` — always render as overlay positioned panels
- Add consistent class: `absolute right-0 top-0 bottom-0 z-20 w-full sm:w-[380px] bg-card shadow-xl sm:rounded-l-3xl flex flex-col`
- Add a semi-transparent backdrop click-to-close on mobile

#### Phase 2: M3 Visual Polish
**File: `ChatSidebar.tsx`**
- Refine header surface: consistent `bg-surface-container-low` pattern using `bg-card`
- Clean up spacing inconsistencies in quick access buttons
- Improve conversation item hover/active states with M3 state layers

**File: `ChatHeader.tsx`**
- Add subtle bottom border or elevation shadow for separation
- Consistent icon button sizing (all `h-10 w-10` on mobile, `h-9 w-9` on desktop)

**File: `MessageBubble.tsx`**
- Refine bubble radius logic for cleaner M3 shape (keep existing tail logic)
- Improve hover action positioning to prevent clipping near edges

**File: `MessageInput.tsx`**
- Consistent input container with `rounded-3xl` surface
- Unified action button sizes

**File: `MessageList.tsx`**
- Improve date separator chip styling
- Better empty state with M3 illustration pattern

#### Phase 3: Responsive Improvements
**All side panels** (Thread, Search, SharedFiles, GroupMembers):
- Mobile (<640px): Full-screen overlay with slide-in animation + `rounded-t-3xl` top corners
- Tablet/Desktop (>=640px): Right-aligned overlay panel with `w-[380px]` and shadow

**ChatView + MessengerPage:**
- Ensure chat view takes full width when a panel is open (panel overlays, doesn't push)
- Touch targets: all interactive elements minimum `h-11` (44px) on mobile

#### Phase 4: Code Cleanup
**Extract shared TUS upload utility** (`src/pages/messenger/uploadUtils.ts`):
- Move TUS upload logic from `MessageInput.tsx` (lines 99-277) and `ThreadPanel.tsx` (lines 94-176)
- Single `uploadFileWithTUS(file, path, callbacks)` function
- Single `formatFileSize(bytes)` function (currently in MessageInput, ThreadPanel, and SharedFilesGallery)

**ThreadPanel.tsx simplification:**
- Remove duplicated `renderMessageContent` (~80 lines) — extract to a shared utility or lightweight component in `utils.ts`
- Remove duplicated EMOJIS constant (defined in both MessageInput and ThreadPanel)

**Remove orphan code:**
- `ContactsListPanel.tsx` — check if imported anywhere; if not, delete
- `VideoCallView.tsx` — verify if still used or replaced by `/call/:roomName` route

### Files to modify
1. `src/pages/messenger/ChatView.tsx` — side panel layout change
2. `src/pages/messenger/components/ThreadPanel.tsx` — overlay positioning + extract upload
3. `src/pages/messenger/components/SearchResultsPanel.tsx` — overlay positioning
4. `src/pages/messenger/components/SharedFilesGallery.tsx` — overlay positioning
5. `src/pages/messenger/components/GroupMembersPanel.tsx` — overlay positioning
6. `src/pages/messenger/components/MessageInput.tsx` — extract upload, M3 polish
7. `src/pages/messenger/components/MessageBubble.tsx` — M3 refinement
8. `src/pages/messenger/components/MessageList.tsx` — M3 refinement
9. `src/pages/messenger/ChatSidebar.tsx` — M3 polish
10. `src/pages/messenger/components/ChatHeader.tsx` — M3 polish
11. `src/pages/messenger/uploadUtils.ts` — NEW: shared upload utility
12. `src/pages/messenger/ContactsListPanel.tsx` — potentially delete
13. `src/pages/messenger/VideoCallView.tsx` — potentially delete

### Files NOT modified (no changes needed)
- `MessengerPage.tsx` — layout is correct, only child components change
- `types.ts`, `utils.ts` — already clean
- `NewChatModal.tsx`, `VideoRoomsPanel.tsx` — already M3-compliant
- `NotificationSettings.tsx`, `StatusPicker.tsx`, `ReactionPicker.tsx`, `ReactionsDisplay.tsx`, `ReadReceiptIndicator.tsx`, `ImageLightbox.tsx`, `VoiceNoteRecorder.tsx`, `MentionAutocomplete.tsx`, `AvatarUpload.tsx`, `DeleteChatDialog.tsx`, `GlobalSearchPanel.tsx`, `IncomingCallModal.tsx` — already clean or minimal

### Execution order
1. Extract `uploadUtils.ts` first (no UI impact, unblocks ThreadPanel cleanup)
2. Fix side panel overlay layout (ChatView + all 4 panels)
3. Clean ThreadPanel (remove duplicated rendering/upload code)
4. M3 polish pass on remaining components
5. Delete orphan files
6. Verify responsive behavior

