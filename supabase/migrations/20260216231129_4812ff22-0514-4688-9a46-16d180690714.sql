
-- Add share_token to task_projects
ALTER TABLE task_projects ADD COLUMN share_token text DEFAULT (gen_random_uuid())::text;

-- RPC: get project by share token (public access)
CREATE OR REPLACE FUNCTION get_project_by_share_token(_token text)
RETURNS SETOF task_projects
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM task_projects WHERE share_token = _token LIMIT 1;
$$;

-- RPC: get tasks by project share token (public access)
CREATE OR REPLACE FUNCTION get_tasks_by_project_share_token(_token text)
RETURNS SETOF tasks
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.* FROM tasks t
  INNER JOIN task_projects p ON t.project_id = p.id
  WHERE p.share_token = _token;
$$;
