

## Problem

The `useProjects` hook (line 42-48) fetches **all** projects from `task_projects` with no user filtering. Similarly, `allTasks` (line 53-64) fetches **all** tasks. A closer (or any non-admin role) sees every project and task in the system instead of only those they created, lead, or are assigned to.

## Plan

**File: `src/pages/tareas/useProjects.ts`**

1. **Filter projects by user involvement** — After fetching all projects, also fetch the user's `project_members` rows. Then filter the projects list client-side to only include projects where:
   - `created_by === user.id`, OR
   - `leader_id === user.id`, OR
   - user appears in `project_members` for that project

   For admins (using `useUserRole`), skip the filter and show everything.

2. **Filter allTasks accordingly** — After filtering projects, only keep tasks whose `project_id` is in the user's visible project set. This ensures KPIs and task counts reflect only relevant data.

**Implementation approach:**

- Import `useUserRole` into `useProjects.ts`
- Add a query for `project_members` filtered by `user_id = user.id` to get the list of project IDs the user is a member of
- Use `useMemo` to compute `filteredProjects` from `projects` using the three ownership conditions above (skip filter if `isAdmin`)
- Filter `allTasks` to only include tasks from `filteredProjects`
- Return `filteredProjects` as `projects` and filtered `allTasks`

This is a client-side filter approach (rather than RLS) because the RLS on `task_projects` is already open to all authenticated users by design (for collaboration visibility). The business logic restriction is role-based, not row-based.

Single file change, no database modifications needed.

