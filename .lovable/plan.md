
# Dashboard Sidebar Width & Design System Alignment

## Problem
The sidebar is 16rem (256px) wide -- too wide for the "MavenCRM" logo. Components need tighter alignment with the design system tokens.

## Changes

### 1. `src/components/ui/sidebar.tsx` - Reduce sidebar width
- Change `SIDEBAR_WIDTH` from `"16rem"` to `"12rem"` (~192px) to match the logo width plus comfortable padding
- This single constant controls both expanded and transition widths globally

### 2. `src/components/dashboard/DashboardSidebar.tsx` - Refine sidebar styling
- Reduce header padding from `p-4` to `p-3` (12px per design system md spacing)
- Use `SidebarSeparator` instead of raw `Separator` with manual margin (follows sidebar component conventions)
- Logo already uses design tokens correctly (text-primary, text-muted-foreground) -- no changes needed

### 3. `src/components/dashboard/DashboardTopbar.tsx` - Align with design tokens
- Already uses design tokens correctly (border-border, bg-background, text-muted-foreground)
- No changes needed -- all values map to CSS variables

### 4. `src/components/dashboard/DashboardMetricCard.tsx` - Verify token compliance
- Already fully compliant: bg-muted, text-muted-foreground, text-success, text-destructive
- No changes needed

### 5. `src/components/dashboard/DashboardContent.tsx` - Verify token compliance
- Already fully compliant: border-border, text-muted-foreground, bg-card tokens via Card component
- No changes needed

## Summary
Only two files actually need changes:
1. **sidebar.tsx**: `SIDEBAR_WIDTH` from `"16rem"` to `"12rem"`
2. **DashboardSidebar.tsx**: header padding `p-4` to `p-3`, use `SidebarSeparator` instead of raw `Separator`

All other dashboard components already use design system tokens correctly -- no hardcoded values found.
