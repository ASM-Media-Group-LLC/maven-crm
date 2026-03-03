
-- Step 1: Create "employee" role in roles_config
INSERT INTO public.roles_config (name, description, is_active, is_system)
VALUES ('employee', 'Empleado general con acceso básico a Dashboard, Tareas y Messenger', true, true)
ON CONFLICT DO NOTHING;

-- Step 2: Insert default permissions for each role
-- We use a DO block to reference role IDs dynamically

DO $$
DECLARE
  v_manager_id uuid := '3c1082d7-be19-4498-8c0a-969e225fff23';
  v_agent_id uuid := '8a9c50bc-eae2-4ec6-9af0-d68fc571434f';
  v_closer_id uuid := '345e773b-a95b-4d69-bd2b-d7c7e2b57869';
  v_supervisor_id uuid := '85ac020e-8f99-4f25-9ce8-c5016fc48802';
  v_employee_id uuid;
BEGIN
  -- Get employee role id (just inserted)
  SELECT id INTO v_employee_id FROM public.roles_config WHERE name = 'employee' LIMIT 1;

  -- Clear existing permissions for non-admin roles to avoid duplicates
  DELETE FROM public.role_permissions WHERE role_id IN (v_manager_id, v_agent_id, v_closer_id, v_supervisor_id, v_employee_id);

  -- MANAGER: Todo excepto Administración
  INSERT INTO public.role_permissions (role_id, module, submodule, can_access, data_scope) VALUES
    (v_manager_id, 'Dashboard', NULL, true, 'all'),
    (v_manager_id, 'Creator Sales', NULL, true, 'all'),
    (v_manager_id, 'Contactos', NULL, true, 'all'),
    (v_manager_id, 'Creadores', NULL, true, 'all'),
    (v_manager_id, 'Eventos', NULL, true, 'all'),
    (v_manager_id, 'Promolog', NULL, true, 'all'),
    (v_manager_id, 'LeadGen', NULL, true, 'all'),
    (v_manager_id, 'Closers', NULL, true, 'all'),
    (v_manager_id, 'Tickets', NULL, true, 'all'),
    (v_manager_id, 'Tareas', NULL, true, 'all'),
    (v_manager_id, 'HR', NULL, true, 'all'),
    (v_manager_id, 'Finanzas', NULL, true, 'all'),
    (v_manager_id, 'Messenger', NULL, true, 'all'),
    (v_manager_id, 'Administración', NULL, false, 'all');

  -- SUPERVISOR: Creadores, Ventas, HR, Tareas, Tickets, Messenger
  INSERT INTO public.role_permissions (role_id, module, submodule, can_access, data_scope) VALUES
    (v_supervisor_id, 'Dashboard', NULL, true, 'all'),
    (v_supervisor_id, 'Creator Sales', NULL, true, 'subordinates'),
    (v_supervisor_id, 'Creadores', NULL, true, 'subordinates'),
    (v_supervisor_id, 'Tickets', NULL, true, 'all'),
    (v_supervisor_id, 'Tareas', NULL, true, 'self'),
    (v_supervisor_id, 'HR', NULL, true, 'subordinates'),
    (v_supervisor_id, 'Messenger', NULL, true, 'all'),
    (v_supervisor_id, 'Contactos', NULL, false, 'all'),
    (v_supervisor_id, 'Eventos', NULL, false, 'all'),
    (v_supervisor_id, 'Promolog', NULL, false, 'all'),
    (v_supervisor_id, 'LeadGen', NULL, false, 'all'),
    (v_supervisor_id, 'Closers', NULL, false, 'all'),
    (v_supervisor_id, 'Finanzas', NULL, false, 'all'),
    (v_supervisor_id, 'Administración', NULL, false, 'all');

  -- AGENT: Creadores (solo Insights), Tareas, Messenger
  INSERT INTO public.role_permissions (role_id, module, submodule, can_access, data_scope) VALUES
    (v_agent_id, 'Dashboard', NULL, true, 'self'),
    (v_agent_id, 'Creadores', NULL, true, 'subordinates'),
    (v_agent_id, 'Tareas', NULL, true, 'self'),
    (v_agent_id, 'Messenger', NULL, true, 'all'),
    (v_agent_id, 'Creator Sales', NULL, false, 'all'),
    (v_agent_id, 'Contactos', NULL, false, 'all'),
    (v_agent_id, 'Eventos', NULL, false, 'all'),
    (v_agent_id, 'Promolog', NULL, false, 'all'),
    (v_agent_id, 'LeadGen', NULL, false, 'all'),
    (v_agent_id, 'Closers', NULL, false, 'all'),
    (v_agent_id, 'Tickets', NULL, false, 'all'),
    (v_agent_id, 'HR', NULL, false, 'all'),
    (v_agent_id, 'Finanzas', NULL, false, 'all'),
    (v_agent_id, 'Administración', NULL, false, 'all');

  -- CLOSER: Closers, Ventas, Contactos, LeadGen, Messenger
  INSERT INTO public.role_permissions (role_id, module, submodule, can_access, data_scope) VALUES
    (v_closer_id, 'Dashboard', NULL, true, 'self'),
    (v_closer_id, 'Closers', NULL, true, 'self'),
    (v_closer_id, 'Creator Sales', NULL, true, 'subordinates'),
    (v_closer_id, 'Contactos', NULL, true, 'all'),
    (v_closer_id, 'LeadGen', NULL, true, 'all'),
    (v_closer_id, 'Messenger', NULL, true, 'all'),
    (v_closer_id, 'Creadores', NULL, false, 'all'),
    (v_closer_id, 'Eventos', NULL, false, 'all'),
    (v_closer_id, 'Promolog', NULL, false, 'all'),
    (v_closer_id, 'Tickets', NULL, false, 'all'),
    (v_closer_id, 'Tareas', NULL, true, 'self'),
    (v_closer_id, 'HR', NULL, false, 'all'),
    (v_closer_id, 'Finanzas', NULL, false, 'all'),
    (v_closer_id, 'Administración', NULL, false, 'all');

  -- EMPLOYEE: Dashboard, Tareas, Messenger
  INSERT INTO public.role_permissions (role_id, module, submodule, can_access, data_scope) VALUES
    (v_employee_id, 'Dashboard', NULL, true, 'self'),
    (v_employee_id, 'Tareas', NULL, true, 'self'),
    (v_employee_id, 'Messenger', NULL, true, 'all'),
    (v_employee_id, 'Creator Sales', NULL, false, 'all'),
    (v_employee_id, 'Contactos', NULL, false, 'all'),
    (v_employee_id, 'Creadores', NULL, false, 'all'),
    (v_employee_id, 'Eventos', NULL, false, 'all'),
    (v_employee_id, 'Promolog', NULL, false, 'all'),
    (v_employee_id, 'LeadGen', NULL, false, 'all'),
    (v_employee_id, 'Closers', NULL, false, 'all'),
    (v_employee_id, 'Tickets', NULL, false, 'all'),
    (v_employee_id, 'HR', NULL, false, 'all'),
    (v_employee_id, 'Finanzas', NULL, false, 'all'),
    (v_employee_id, 'Administración', NULL, false, 'all');
END $$;
