-- Eliminación de las features muertas Tareas, Eventos y Wishlist/SuperContacts
-- (decisión del owner 2026-08-23; código eliminado en PR #1300; APLICADA en
-- prod vía MCP ese mismo día). Datos respaldados en
-- docs/backups/2026-08-23-features-eliminadas-tareas-eventos-wishlist.json.
drop view if exists public.v_super_contacts;
drop table if exists
  public.subtask_assignees, public.subtasks, public.task_assignees,
  public.task_attachments, public.task_blockers, public.task_comments,
  public.tasks, public.project_documentation, public.project_folders,
  public.project_links, public.project_members, public.task_projects,
  public.event_attendance_log, public.event_checklist_items,
  public.event_guests, public.events, public.super_contact_interactions,
  public.super_contact_outreach, public.super_contacts
cascade;
drop function if exists public.get_task_by_share_token(text);
drop function if exists public.get_task_by_share_token(uuid);
drop function if exists public.is_project_creator(uuid);
drop function if exists public.is_project_creator(uuid, uuid);
drop function if exists public.user_has_tasks_in_project(uuid);
drop function if exists public.user_has_tasks_in_project(uuid, uuid);
delete from public.role_permissions
  where module in ('Tareas', 'Eventos', 'SuperContacts', 'Mensajes Pro');
