

# Plan: Fix Sidebar, Analytics, Blockers & Comments

## Root Causes Found

### 1. Global Analytics Error: `column tasks.assignees does not exist`
In `useProjects.ts` line 109, the query explicitly selects `assignees` — but the `tasks` table has no such column. This causes the entire query to fail, breaking global analytics.

### 2. Sidebar Shows "No hay proyectos"
`ProjectMiniSidebar.tsx` first queries `project_members WHERE user_id = current_user`, then fetches projects matching those IDs. The "Test Admin" user has **0 rows** in `project_members`, so the sidebar returns empty. Unlike `useProjects.ts` (which checks `isAdmin` and shows all), the sidebar has no admin bypass.

### 3. Blockers RLS Blocks Admins
The `task_blockers` RLS policy requires the user to exist in `project_members` for the task's project. Since admin isn't a member, INSERT/SELECT/UPDATE all fail silently.

### 4. Comments RLS Blocks Admins
Same pattern — `task_comments` INSERT and SELECT policies use `is_project_member()`, which checks `project_members`. Admin with no membership = denied.

---

## Changes

### A. Fix `useProjects.ts` — Remove `assignees` from query
- Line 109: remove `assignees` from the select list (column doesn't exist)
- Use `select("*")` or list only valid columns

### B. Fix `ProjectMiniSidebar.tsx` — Admin bypass
- Import `useUserRole` and check `isAdmin`
- If admin: query all active projects directly from `task_projects` (skip `project_members` filter)
- If non-admin: keep current membership-based query

### C. Fix `task_blockers` RLS — Add admin access (DB migration)
Update the single ALL policy to include admin check:
```sql
DROP POLICY "Project members can manage blockers" ON task_blockers;

CREATE POLICY "Project members can manage blockers" ON task_blockers
FOR ALL USING (
  has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN project_members pm ON pm.project_id = t.project_id
    WHERE t.id = task_blockers.task_id AND pm.user_id = auth.uid()
  )
) WITH CHECK (
  has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN project_members pm ON pm.project_id = t.project_id
    WHERE t.id = task_blockers.task_id AND pm.user_id = auth.uid()
  )
);
```

### D. Fix `task_comments` RLS — Add admin access (DB migration)
Update both SELECT and INSERT policies:
```sql
DROP POLICY "Members can view task comments" ON task_comments;
CREATE POLICY "Members can view task comments" ON task_comments
FOR SELECT USING (
  has_role(auth.uid(), 'admin') OR
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_comments.task_id AND is_project_member(auth.uid(), t.project_id))
);

DROP POLICY "Members can create task comments" ON task_comments;
CREATE POLICY "Members can create task comments" ON task_comments
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND (
    has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_comments.task_id AND is_project_member(auth.uid(), t.project_id))
  )
);
```

---

## Files to modify

| File | Change |
|------|--------|
| `useProjects.ts` | Remove `assignees` from select |
| `ProjectMiniSidebar.tsx` | Add admin bypass to show all projects |
| DB migration | Update `task_blockers` + `task_comments` RLS policies |

