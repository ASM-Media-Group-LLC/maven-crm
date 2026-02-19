-- Insertar nuevos roles
INSERT INTO roles_config (name, description, is_system, is_active)
VALUES
  ('agent', 'Standard agent access', true, true),
  ('closer', 'Sales closing and deal management', true, true),
  ('supervisor', 'Team supervision and QA access', true, true);

-- Actualizar descripcion de admin
UPDATE roles_config SET description = 'Full administrative access' WHERE name = 'admin';

-- Actualizar descripcion de manager  
UPDATE roles_config SET description = 'MG' WHERE name = 'manager';

-- Eliminar rol employee (reemplazado por agent)
DELETE FROM roles_config WHERE name = 'employee';