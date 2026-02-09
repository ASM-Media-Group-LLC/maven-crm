

# Dashboard Layout - Structural Blueprint

## Overview
Create the `/dashboard` route as the base container for MavenCRM. This page defines **only layout and visual containers** using placeholders -- no logic, no real data, no features. It follows the existing design system tokens, sidebar component, and patterns already in the project.

## Architecture

Three fixed layers:

```text
+------------+--------------------------------------------+
|            |              TOPBAR (fixed)                |
|  SIDEBAR   +--------------------------------------------+
|  (fixed)   |                                            |
|  100vh     |           MAIN CONTENT (scroll)            |
|            |                                            |
|            |  +--------------------------------------+  |
|            |  | Dashboard Header                     |  |
|            |  +--------------------------------------+  |
|            |  | Metric | Metric | Metric | Metric    |  |
|            |  +--------------------------------------+  |
|            |  | Chart Placeholder  | Activity Card   |  |
|            |  +--------------------------------------+  |
|            |                                            |
+------------+--------------------------------------------+
```

## Files to Create

### 1. `src/components/dashboard/DashboardSidebar.tsx`
Sidebar using the existing `Sidebar` component from `src/components/ui/sidebar.tsx`.

- **Header**: `Logo` component (size="sm")
- **Main menu** (6 items with Lucide icons):
  - Dashboard (`LayoutDashboard`)
  - Chats (`MessageSquare`)
  - Contacts (`Users`)
  - Events (`Calendar`)
  - Analytics (`BarChart3`)
- **Separator**
- **Secondary menu**:
  - Settings (`Settings`)
- Uses `NavLink` for active state highlighting
- Tooltip on collapsed state via `SidebarMenuButton tooltip` prop
- Collapsible: `icon` mode (expanded = icon+label, collapsed = icon only)

### 2. `src/components/dashboard/DashboardTopbar.tsx`
Fixed horizontal bar above the main content.

- **Left**: `SidebarTrigger` button
- **Center**: `Input` placeholder for search (disabled, placeholder text only)
- **Right**: Bell icon (notification placeholder) + `Avatar` placeholder (initials "U")
- Height: fixed `h-14`, border-bottom, background with backdrop blur

### 3. `src/components/dashboard/DashboardMetricCard.tsx`
Reusable metric card placeholder component.

- Props: `label`, `value`, `icon`, `trend` (up/down/neutral)
- Uses `Card` from the design system
- Displays: icon, label (muted text), large value, trend indicator arrow with color (success/destructive)
- All values are placeholder strings passed as props

### 4. `src/components/dashboard/DashboardContent.tsx`
The scrollable main area containing:

- **Section 3.1 - Header**: h2 title "Dashboard" + muted subtitle placeholder
- **Section 3.2 - Metrics row**: 4 `DashboardMetricCard` with placeholder values ("--", "0", etc.) laid out in a responsive grid (grid-cols-1 sm:grid-cols-2 lg:grid-cols-4)
- **Section 3.3 - Data area**: Two cards in a grid (lg:grid-cols-3):
  - Large card (col-span-2): "Chart placeholder" with empty state (dashed border, muted icon+text)
  - Smaller card (col-span-1): "Recent activity" with empty state

### 5. `src/pages/Dashboard.tsx`
Page component that composes the layout:

- Wraps everything in `SidebarProvider`
- Renders `DashboardSidebar` + a flex container for `DashboardTopbar` + `DashboardContent`
- Main content is `flex-1 overflow-auto`

## Files to Modify

### `src/App.tsx`
- Import `Dashboard` page
- Add route: `<Route path="/dashboard" element={<Dashboard />} />`

### `src/pages/Index.tsx`
- Add a "Dashboard" button linking to `/dashboard`

## Visual States (CSS only, no logic)
- **Active nav item**: `bg-sidebar-accent text-sidebar-accent-foreground font-medium` via NavLink activeClassName
- **Hover**: existing sidebar hover tokens (`hover:bg-sidebar-accent`)
- **Empty states**: dashed border containers with muted icon + "No data" placeholder text

## Design Token Compliance
- All colors from CSS variables (bg-background, bg-card, text-foreground, text-muted-foreground, border-border, etc.)
- Spacing via Tailwind scale (p-6, gap-6, etc.)
- Border radius via design system tokens (rounded-lg)
- Light/dark mode fully supported via existing class-based theming
- No hardcoded color values

## Technical Notes
- No state management beyond sidebar open/collapsed (handled by SidebarProvider)
- No API calls, no data fetching, no conditional rendering
- Desktop-first responsive grid
- Sidebar uses `collapsible="icon"` for expand/collapse without layout shift

