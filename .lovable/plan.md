

## Plan: Redesign Messenger Module with Material Design 3 (Material You)

This is a large visual overhaul across ~15 files. No functionality changes — only styling, shape tokens, elevation, and responsive improvements aligned with the M3 design system already used in the Cowork module.

### Design Tokens Applied

```text
Surfaces:       bg-card → bg-primary/5, bg-card (tonal hierarchy)
Shapes:         rounded-lg → rounded-3xl (containers), rounded-2xl (cards), rounded-full (chips/pills)
Elevation:      shadow-sm → shadow-none + surface tints (bg-primary/5, bg-primary/8)
Typography:     text-xs → text-[13px], compact line heights
Components:     ghost buttons → tonal buttons (bg-primary/10), FAB for compose
State layers:   hover:bg-muted → hover:bg-primary/8, active:bg-primary/12
Borders:        border-border → border-transparent or border-primary/10
```

### Files and Changes

**1. `src/pages/messenger/MessengerPage.tsx`**
- Root container: `bg-background` → M3 surface tint with `rounded-3xl` on desktop wrapper
- Sidebar: responsive breakpoints remain, add `rounded-3xl` container shape on `sm+`

**2. `src/pages/messenger/ChatSidebar.tsx`**
- Header: remove `border-b`, use tonal surface `bg-primary/5` with `rounded-3xl` top corners
- Search bar: pill shape `rounded-full` with `bg-primary/5` surface tint instead of `bg-muted/50`
- Quick access tabs: already `rounded-full` — update active state to M3 tonal `bg-primary/12`
- Section headers: M3 label-small typography (tracking, weight)
- ConversationItem: `rounded-lg` → `rounded-2xl`, active state `bg-primary/10` → `bg-primary/12` with `ring-0`, hover state `bg-primary/5`
- Unread badge: keep `rounded-full`, ensure M3 tonal surface
- Contact items: `rounded-full` → `rounded-2xl` for consistency
- Overall: remove `border-r border-border`, use surface elevation instead

**3. `src/pages/messenger/components/ChatHeader.tsx`**
- Container: remove `border-b`, use `bg-primary/5` surface, `rounded-b-none` (flat bottom) or no radius
- Action buttons: ghost → tonal `bg-primary/8 hover:bg-primary/12 rounded-full`
- Avatar: `ring-2 ring-primary/30` → M3 container with `rounded-full`
- Dropdown menu: `rounded-2xl` with surface tint

**4. `src/pages/messenger/components/MessageBubble.tsx`**
- Sent bubbles: `bg-primary` → M3 `bg-primary` with `rounded-3xl` (keep `rounded-br-md` for tail)
- Received bubbles: `bg-card border` → `bg-primary/8 border-0 rounded-3xl` (keep `rounded-bl-md` for tail)
- Hover actions: `bg-card shadow-sm border` → `bg-primary/10 border-0 rounded-full shadow-none`
- Reply quote: `border-l-2` → `rounded-xl bg-primary/5` surface
- Thread button: M3 tonal chip style `bg-primary/8 rounded-full px-3 py-1`
- File attachments: `rounded-lg` → `rounded-2xl` M3 cards

**5. `src/pages/messenger/components/MessageInput.tsx`**
- Container: remove `border-t`, use `bg-primary/5` surface
- Textarea: `rounded-2xl` → `rounded-3xl bg-primary/5 border-0`
- Send button: FAB style `rounded-full bg-primary shadow-md` → M3 `rounded-full bg-primary shadow-none` with larger touch target on mobile (`h-11 w-11`)
- Emoji/Attach buttons: `rounded-full` tonal `bg-primary/8`
- File previews: `rounded-lg` → `rounded-2xl` with `bg-primary/5`
- Upload progress: `bg-primary/5` → M3 linear indicator style
- Reply bar: `bg-muted/30` → `bg-primary/5 rounded-2xl mx-2 mt-2`

**6. `src/pages/messenger/components/MessageList.tsx`**
- Date separator: `bg-muted/60` → `bg-primary/8 rounded-full` M3 chip
- Empty state: `bg-primary/10 rounded-full` → `bg-primary/8 rounded-3xl` M3 container
- Max-width constraint: keep `max-w-2xl` for readability

**7. `src/pages/messenger/VideoRoomsPanel.tsx`**
- Container: `bg-card border-r` → `bg-background` no border
- Header: `border-b` → M3 surface tint `bg-primary/5`
- Room cards: `Card` → M3 tonal surface `bg-primary/5 rounded-3xl border-0`
- Action buttons: M3 FAB/tonal `rounded-full`
- Input: `rounded-full bg-primary/5`
- Live badge: M3 chip style `rounded-full`

**8. `src/pages/messenger/NewChatModal.tsx`**
- Dialog: `sm:max-w-md` → `rounded-3xl` M3 dialog shape
- User list items: `rounded-lg` → `rounded-2xl` with M3 state layers
- Search input: `rounded-full bg-primary/5`
- Create button: M3 filled tonal `rounded-full`

**9. `src/pages/messenger/components/SearchResultsPanel.tsx`**
- Container: `border-l border-border` → surface elevation `bg-card rounded-l-3xl` on desktop
- Search input: `rounded-full bg-primary/5`
- Result items: `border-b` → `rounded-2xl` with hover `bg-primary/5`
- Date sticky header: M3 label style

**10. `src/pages/messenger/components/ThreadPanel.tsx`**
- Panel container: M3 surface `rounded-l-3xl` on desktop
- Header: M3 tonal surface
- Message bubbles inside: same M3 treatment as MessageBubble
- Input area: same M3 treatment as MessageInput

**11. `src/pages/messenger/components/SharedFilesGallery.tsx`**
- Container: M3 surface with `rounded-l-3xl`
- Tab chips: `rounded-full` M3 filter chips
- File cards: `rounded-2xl` M3 cards

**12. `src/pages/messenger/components/GroupMembersPanel.tsx`**
- Container: M3 surface with `rounded-l-3xl`
- Member items: `rounded-2xl` with M3 state layers
- Action buttons: tonal `rounded-full`

**13. `src/pages/messenger/components/NotificationSettings.tsx`**
- Container: `rounded-xl` → `rounded-3xl` M3 dialog
- Radio/Switch: keep shadcn components, adjust surrounding surfaces

**14. `src/pages/messenger/components/SpacesPanel.tsx`**
- Space headers: M3 label typography
- Conversation items within spaces: `rounded-2xl` M3 state layers
- Create input: `rounded-full`
- Drop zones: `rounded-2xl border-2 border-dashed border-primary/20`

**15. `src/pages/messenger/components/StatusPicker.tsx`**
- Popover trigger: M3 tonal pill `rounded-full bg-primary/8`
- Status options: `rounded-full` chips

### Responsive Improvements

All files will get:
- **Mobile (<640px)**: Full-width panels, larger touch targets (`min-h-11`), bottom-sheet-style side panels (`rounded-t-3xl`), hidden drag handles
- **Tablet (640-1024px)**: Sidebar `w-[280px]`, side panels overlay with backdrop
- **Desktop (>1024px)**: Current layout with M3 surfaces, `rounded-3xl` containers

Specific responsive fixes:
- `ChatSidebar`: On mobile, search bar gets `h-11` touch target
- `MessageInput`: On mobile, send/emoji/attach buttons get `h-11 w-11`
- Side panels (Search, Thread, Files, Members): On mobile, render as full-width overlays with `rounded-t-3xl` instead of `w-80 border-l`
- `VideoRoomsPanel`: Full-width on mobile
- `ConversationItem`: Increase padding on mobile for touch targets

### Cleanup
- Remove unused `SectionHeader` component from `ChatSidebar.tsx`
- Remove `VideoCallView.tsx` demo component dead code (layout state remnants from spotlight removal)
- Consolidate duplicate `getInitials` functions into a single import from `utils.ts` across all components
- Remove unused `SearchCheck` import from `ChatSidebar.tsx`

### Files Modified
- `src/pages/messenger/MessengerPage.tsx`
- `src/pages/messenger/ChatSidebar.tsx`
- `src/pages/messenger/ChatView.tsx`
- `src/pages/messenger/VideoRoomsPanel.tsx`
- `src/pages/messenger/NewChatModal.tsx`
- `src/pages/messenger/components/ChatHeader.tsx`
- `src/pages/messenger/components/MessageBubble.tsx`
- `src/pages/messenger/components/MessageInput.tsx`
- `src/pages/messenger/components/MessageList.tsx`
- `src/pages/messenger/components/SearchResultsPanel.tsx`
- `src/pages/messenger/components/ThreadPanel.tsx`
- `src/pages/messenger/components/SharedFilesGallery.tsx`
- `src/pages/messenger/components/GroupMembersPanel.tsx`
- `src/pages/messenger/components/NotificationSettings.tsx`
- `src/pages/messenger/components/SpacesPanel.tsx`
- `src/pages/messenger/components/StatusPicker.tsx`

