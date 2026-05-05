
-- Insert new categories
INSERT INTO roadmap_categories (id, name, position) VALUES
  ('b0000001-0000-0000-0000-000000000009', 'Recursos Humanos', 9),
  ('b0000001-0000-0000-0000-000000000010', 'Comunicación', 10),
  ('b0000001-0000-0000-0000-000000000011', 'Finanzas', 11);

-- Delete old "Módulos Pendientes" items
DELETE FROM roadmap_items WHERE category_id = 'a0000001-0000-0000-0000-000000000008';

-- Delete the "Módulos Pendientes" category
DELETE FROM roadmap_categories WHERE id = 'a0000001-0000-0000-0000-000000000008';

-- Insert Recursos Humanos items (17 items)
INSERT INTO roadmap_items (category_id, submodule, task, status, position) VALUES
  ('b0000001-0000-0000-0000-000000000009', 'Lifecycle', 'Empleados CRUD + Perfil completo', 'done', 1),
  ('b0000001-0000-0000-0000-000000000009', 'Lifecycle', 'Candidatos (Applicants)', 'done', 2),
  ('b0000001-0000-0000-0000-000000000009', 'Lifecycle', 'Onboarding / Offboarding', 'done', 3),
  ('b0000001-0000-0000-0000-000000000009', 'Control Laboral', 'Asistencia (Attendance)', 'done', 4),
  ('b0000001-0000-0000-0000-000000000009', 'Control Laboral', 'Ausencias', 'done', 5),
  ('b0000001-0000-0000-0000-000000000009', 'Control Laboral', 'Vacaciones y Días Personales', 'done', 6),
  ('b0000001-0000-0000-0000-000000000009', 'Control Laboral', 'Permisos horarios', 'done', 7),
  ('b0000001-0000-0000-0000-000000000009', 'Gestión Tiempo', 'Horarios y Schedules', 'done', 8),
  ('b0000001-0000-0000-0000-000000000009', 'Gestión Tiempo', 'Horas Extras', 'done', 9),
  ('b0000001-0000-0000-0000-000000000009', 'Gestión Tiempo', 'Banco de Horas', 'done', 10),
  ('b0000001-0000-0000-0000-000000000009', 'Desarrollo', 'Monitoreo de actividad', 'done', 11),
  ('b0000001-0000-0000-0000-000000000009', 'Desarrollo', 'Capacitación (Training por roles)', 'done', 12),
  ('b0000001-0000-0000-0000-000000000009', 'Desarrollo', 'Desempeño (Performance wizard)', 'done', 13),
  ('b0000001-0000-0000-0000-000000000009', 'Disciplina', 'Incidentes', 'done', 14),
  ('b0000001-0000-0000-0000-000000000009', 'Organización', 'Directorio y Organigrama', 'done', 15),
  ('b0000001-0000-0000-0000-000000000009', 'Organización', 'Deducciones y Adelantos', 'done', 16),
  ('b0000001-0000-0000-0000-000000000009', 'Comunicación', 'Anuncios de RRHH', 'done', 17);

-- Insert Comunicación items (5 items)
INSERT INTO roadmap_items (category_id, submodule, task, status, position) VALUES
  ('b0000001-0000-0000-0000-000000000010', 'Messenger', 'Chat en tiempo real con conversaciones', 'done', 1),
  ('b0000001-0000-0000-0000-000000000010', 'Messenger', 'Videollamadas (LiveKit)', 'done', 2),
  ('b0000001-0000-0000-0000-000000000010', 'Messenger', 'Contador de no leídos en sidebar', 'done', 3),
  ('b0000001-0000-0000-0000-000000000010', 'Notificaciones', 'Sistema de notificaciones con deep linking', 'done', 4),
  ('b0000001-0000-0000-0000-000000000010', 'Notificaciones', 'Notificaciones de chat automáticas (trigger SQL)', 'done', 5);

-- Insert Finanzas items (9 items)
INSERT INTO roadmap_items (category_id, submodule, task, status, position) VALUES
  ('b0000001-0000-0000-0000-000000000011', 'Dashboard', 'Dashboard financiero', 'done', 1),
  ('b0000001-0000-0000-0000-000000000011', 'Nómina', 'Gestión de nómina', 'done', 2),
  ('b0000001-0000-0000-0000-000000000011', 'Comisiones', 'Sistema de comisiones', 'done', 3),
  ('b0000001-0000-0000-0000-000000000011', 'Facturación', 'Facturación', 'done', 4),
  ('b0000001-0000-0000-0000-000000000011', 'Control', 'Control financiero', 'done', 5),
  ('b0000001-0000-0000-0000-000000000011', 'Reportes', 'Reportes financieros', 'done', 6),
  ('b0000001-0000-0000-0000-000000000011', 'Horas', 'Horas y horas variables', 'done', 7),
  ('b0000001-0000-0000-0000-000000000011', 'Collections', 'Colecciones/cobros', 'done', 8),
  ('b0000001-0000-0000-0000-000000000011', 'Configuración', 'Configuración financiera', 'done', 9);

-- Add missing items to existing categories
INSERT INTO roadmap_items (category_id, submodule, task, status, position) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Notificaciones', 'Sistema de notificaciones con deep linking', 'done', 7),
  ('a0000001-0000-0000-0000-000000000005', 'LeadGen', 'Base de datos de leads', 'done', 6);
