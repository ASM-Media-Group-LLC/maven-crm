

## Material Design 3 Redesign — Cowork Module

### Scope
Redesign all 5 Cowork UI files to follow Material Design 3 (Material You) principles while preserving 100% of existing functionality. The hook (`useCoworkSession.ts`) and `LiveKitCallView` are untouched.

### M3 Design Principles Applied
- **Surface tonal system**: Replace hard `bg-[#202124]` / `border-white/10` with CSS variable-based surfaces (`bg-background`, `bg-card`, `bg-muted`) that respect light/dark mode
- **Shape scale**: Large containers `rounded-3xl`, cards `rounded-2xl`, chips/badges `rounded-full`
- **Elevation via tint, not shadow**: Surface containers use layered `bg-primary/5`, `bg-primary/8` etc.
- **Typography**: M3 headline/title/body/label hierarchy using Tailwind text sizes
- **Components**: Tonal buttons (filled-tonal), icon buttons with state layers, FABs for primary actions
- **Responsive**: Mobile-first with bottom sheet patterns on small screens, rail→sidebar on larger

### Files Modified

**1. `CoworkPage.tsx`** — Landing screen
- Replace plain icon+text with M3 hero surface: large rounded container, tonal background, headline typography
- FAB-style "Crear sesión" button with `rounded-full` and tonal fill
- Session-ended state as M3 dialog-like centered card
- Loading spinner using M3 circular indicator styling

**2. `CoworkCreateDialog.tsx`** — Create session dialog
- M3 dialog styling: `rounded-3xl`, surface-container background
- Input fields with M3 outlined text field styling (taller, rounded-xl)
- Room list items with M3 chips/pill styling
- Tonal "Crear" button, text "Cancelar" button

**3. `CoworkLobby.tsx`** — Join session card
- M3 card with `rounded-3xl`, surface-container-highest background
- Large icon in a tonal circle container
- Filled tonal button for joining

**4. `CoworkHostDashboard.tsx`** — Host dashboard (largest file)
- **Sidebar**: M3 navigation drawer — surface-container background, rounded items with state layers, section headers as M3 label-small, replace hard-coded dark colors with theme variables
- **Room cards**: M3 filled cards with `rounded-2xl`, tonal overlays, avatar chips with online indicators
- **Host Hub floating**: M3 bottom sheet aesthetic — `rounded-t-3xl` on mobile, floating card with `rounded-3xl` on desktop
- **Buttons**: Tonal icon buttons for actions, filled-tonal for "Entrar", text for secondary actions
- **Responsive**: Sidebar as bottom drawer on mobile (`fixed bottom-0`), standard sidebar on `md+`

**5. `CoworkParticipantView.tsx`** — Participant view
- **Top bar**: M3 top app bar — surface-container, `rounded-b-2xl` overhang on mobile, proper spacing
- **Action buttons**: M3 tonal chips instead of ghost buttons — `rounded-full`, proper padding, icon+label
- **Reconnect button**: M3 extended FAB style — `rounded-full`, prominent tonal color, subtle elevation
- **Empty states**: M3 surface containers with centered content, tonal icon circles

### Responsive Strategy
- **Mobile (<768px)**: Single column, bottom actions, collapsible panels, chip-style compact buttons
- **Tablet (768-1024px)**: 2-column room grid, sidebar as overlay drawer
- **Desktop (1024+)**: 3-column room grid, persistent sidebar, floating Hub

### What's NOT Changed
- `useCoworkSession.ts` — pure logic, no UI
- `LiveKitCallView` — separate video module
- All event handlers, state management, refs, effects — 100% preserved
- All toast messages, error handling, navigation logic

### Cleanup
- Remove all hardcoded `bg-[#202124]`, `text-white/XX`, `border-white/XX` — use theme tokens
- Remove unused icon imports after audit
- Consolidate repeated className patterns into reusable style constants where >3 repetitions exist

