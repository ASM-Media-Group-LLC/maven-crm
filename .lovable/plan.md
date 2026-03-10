

## Analysis: Internal Announcements Visibility

After a thorough review of the announcements system, **the logic is already correct** -- global announcements will be visible to all roles (closer, employee, manager, etc.).

Here is the verification:

### How it works today

1. **`useAnnouncements.ts` (line 93-94)**: If `visibility === "global"`, the announcement is returned to ALL authenticated users regardless of role. No permission check blocks it.

2. **Dashboard (`DashboardContent.tsx`)**: The "Avisos y Celebraciones" card is **not** wrapped in any `canAccess()` guard -- it renders for every role.

3. **Banners** (`AnnouncementBanner` on line 310): Rendered for all roles, no permission gate.

4. **Popups** (`Dashboard.tsx` line 24): Rendered for all roles, no permission gate.

### Current state

The database has **0 announcements** right now, so nothing is displaying for any role. When you create a general/global announcement, it will appear for all roles on the dashboard via feed, banner, or popup depending on the delivery channel selected.

### No code changes needed

The announcement audience filtering system is correctly implemented:
- `visibility = "global"` → shown to everyone
- `visibility = "targeted"` → checks `announcement_audience` table for department/role/user matches

If you'd like, you can test this by creating a global announcement from the admin panel and verifying it appears on the dashboard for a closer account.

