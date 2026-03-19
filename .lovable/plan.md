

## Plan: Cowork Module — M3 Redesign + Responsiveness + Cleanup

### Summary
Redesign all 5 Cowork UI components to use Material Design 3 (Material You) tokens, replace hardcoded dark colors with theme-aware tokens, add full responsiveness, and wrap the module in the app layout. No functionality changes.

### Current Problems
- Hardcoded dark theme colors (`bg-[#202124]`, `text-white`, `border-white/10`) — breaks light/dark theme switching
- No app layout wrapper (missing sidebar + topbar)
- ParticipantView top bar actions overflow on mobile (5+ buttons in a row)
- CreateDialog lacks M3 styling (rounded corners, tonal surfaces)
- Lobby card is minimal, no responsive scaling

---

### Files to Modify

#### 1. `src/App.tsx` (1 line)
- Wrap `<CoworkPage />` with `<HRLayout>` so it gets the sidebar + topbar like all other modules

#### 2. `src/pages/cowork/CoworkPage.tsx`
- Replace `min-h-[80vh]` with `h-full` (since HRLayout handles outer chrome)
- Apply M3 tonal surfaces: `bg-primary/5` → keep, `rounded-3xl` → keep
- Landing, loading, and "ended" states: use `h-full` centering instead of `min-h-[80vh]`

#### 3. `src/pages/cowork/CoworkLobby.tsx`
- Replace `min-h-[80vh]` with `h-full`
- M3 card styling: tonal surface, elevation tokens, rounded-3xl maintained
- Responsive padding adjustments for mobile

#### 4. `src/pages/cowork/CoworkCreateDialog.tsx`
- M3 dialog styling: rounded-2xl content, tonal label styling
- Room list items: M3 chip-like inputs with rounded-xl
- Buttons: rounded-full for primary action (M3 FAB/tonal pattern)

#### 5. `src/pages/cowork/CoworkHostDashboard.tsx` (largest change)
- **Remove all hardcoded colors**: `bg-[#202124]` → `bg-background`, `text-white` → `text-foreground`, `border-white/10` → `border-border`, `bg-white/5` → `bg-card` or `bg-primary/5`
- **Sidebar**: `bg-card` with `border-border`, M3 surface tonal hierarchy
- **Room cards**: `bg-card border-border rounded-2xl` with M3 elevation
- **Participant avatars**: M3 tonal containers (`bg-primary/10`)
- **Request sections**: M3 tonal chips (`bg-amber-500/10` → `bg-warning/10`)
- **Host Hub floating window**: theme-aware `bg-card border-border`, M3 rounded-2xl
- **Mobile responsiveness**: sidebar bottom-sheet pattern on mobile (slide-up instead of slide-left), room grid `grid-cols-1 → sm:2 → xl:3` (already exists, verify)
- **Top bar in room view**: responsive action wrapping

#### 6. `src/pages/cowork/CoworkParticipantView.tsx`
- **Remove hardcoded colors**: same token replacement as Host
- **Top bar actions**: wrap in a responsive container — on mobile, collapse into a dropdown/sheet menu instead of horizontal overflow
- **Waiting state**: M3 surface container with tonal background
- **"Left room" state**: M3 card with rounded-3xl, tonal button
- **Bottom sheet pattern on mobile**: action buttons move to a floating bottom bar on small screens

#### 7. `src/hooks/useCoworkSession.ts` and `src/hooks/useCoworkMediaPresence.ts`
- No changes needed (pure logic, no UI)

---

### M3 Token Mapping (consistent across all files)

```text
BEFORE (hardcoded)           → AFTER (theme tokens)
─────────────────────────────────────────────────
bg-[#202124]                 → bg-background
bg-[#1a1a1d]                 → bg-card
bg-[#2a2a2d]                 → bg-muted
text-white                   → text-foreground
text-white/90                → text-foreground
text-white/70                → text-muted-foreground
text-white/50                → text-muted-foreground
text-white/40                → text-muted-foreground/70
text-white/30                → text-muted-foreground/50
border-white/10              → border-border
border-white/5               → border-border/50
bg-white/5                   → bg-primary/5
bg-white/10                  → bg-muted/50
bg-white/20                  → bg-muted
text-green-400               → text-emerald-500
text-red-400                 → text-destructive
text-amber-400               → text-warning (or text-amber-500)
text-blue-400                → text-primary
```

### M3 Shape Scale
- Main containers: `rounded-3xl`
- Cards/panels: `rounded-2xl`
- Interactive elements: `rounded-xl`
- Buttons: `rounded-full` (FAB/tonal) or `rounded-xl` (standard)
- Chips/badges: `rounded-full`

### Responsiveness Strategy
- **ParticipantView top bar**: Actions collapse into an icon-button dropdown menu on `< md`
- **HostDashboard sidebar**: Already uses mobile slide-out pattern — keep but update to M3 surface tokens
- **Room cards grid**: Already responsive — verify and keep
- **Host Hub popup**: Reduce width on mobile (`w-[calc(100vw-2rem)]` on `< sm`)
- **Lobby/Landing/Ended**: Single-column centered, padding scales with viewport

### Cleanup
- No orphan files or dead code found in the module — the 5 components + 2 hooks are all actively used
- Remove unused `Card/CardContent/CardHeader/CardTitle` imports if they get replaced by plain divs with M3 classes (evaluate per file)

