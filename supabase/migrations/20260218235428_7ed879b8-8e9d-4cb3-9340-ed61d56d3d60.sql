-- Update 6 items to done
UPDATE roadmap_items 
SET status = 'done', completed_at = NOW()
WHERE id IN (
  '6f20fdd4-3163-4e7f-92bb-1ad46e3755f8',
  'b4294c98-0782-4a71-af50-e2c8d61a3026',
  'b2509632-51e9-4a85-ab29-78d8e82f05a3',
  'ddd7b605-aa3e-4cbd-9e59-d83967f0a06f',
  'c28a5e2b-c4fd-4ec9-8432-214db771049c',
  'a726259b-c554-4750-98e4-e205a1947ab8'
);

-- Insert 3 pending modules
INSERT INTO roadmap_items (category_id, submodule, task, status, position)
VALUES
  ('a0000001-0000-0000-0000-000000000008', 'RRHH', 'Gestión de Empleados (RRHH)', 'todo', 1),
  ('a0000001-0000-0000-0000-000000000008', 'Finanzas', 'Contabilidad', 'todo', 2),
  ('a0000001-0000-0000-0000-000000000008', 'Creadoras', 'Gestión de Creadoras', 'todo', 3);