-- Insert today's completed items and pending items into the roadmap

-- LeadGen items (category: c0000001-0000-0000-0000-000000000004)
INSERT INTO roadmap_items (category_id, task, description, status, completed_at, position) VALUES
('c0000001-0000-0000-0000-000000000004', 'AgentDetailView scroll + paginador + auto-hide stats', 'Scroll interno, paginador funcional y ocultado automático de stats cards al hacer scroll', 'done', now(), 100),
('c0000001-0000-0000-0000-000000000004', 'AgentDetailView acciones funcionales', 'Botón Eye navega al lead, acciones de QA integradas', 'done', now(), 101),
('c0000001-0000-0000-0000-000000000004', 'QA funcional para supervisores/admins', 'Popover de review con rating + comentario en tab QA', 'done', now(), 102),
('c0000001-0000-0000-0000-000000000004', 'QA retroalimentación - filtro corregido', 'Solo muestra leads con QA review realizado (qaMap)', 'done', now(), 103),
('c0000001-0000-0000-0000-000000000004', 'AgentHourlyPerformance design system', 'KPI cards y quality cards estandarizadas al design system', 'done', now(), 104),
('c0000001-0000-0000-0000-000000000004', 'Auto-hide stats tabs leads-hora y rendimiento', 'onScroll handler agregado a tabs faltantes', 'done', now(), 105),
('c0000001-0000-0000-0000-000000000004', 'AgentDetailView query propia', 'Carga TODOS los leads del agente sin depender de paginación', 'done', now(), 106),
('c0000001-0000-0000-0000-000000000004', 'Badges QA estandarizados', 'Variantes -soft del design system en todos los badges de categoría', 'done', now(), 107),
('c0000001-0000-0000-0000-000000000004', 'Acciones bulk en tabla de leads', 'Selección múltiple + acción masiva', 'todo', null, 110)
ON CONFLICT DO NOTHING;

-- Creadores items (category: a0000001-0000-0000-0000-000000000003)
INSERT INTO roadmap_items (category_id, task, description, status, completed_at, position) VALUES
('a0000001-0000-0000-0000-000000000003', 'Closers: acceso granular por submódulo', 'Closers solo ven Lista + Nuevo en módulo Creadores', 'done', now(), 100),
('a0000001-0000-0000-0000-000000000003', 'Closers: filtro de ownership', 'Closers solo ven creators que convirtieron (created_by)', 'done', now(), 101),
('a0000001-0000-0000-0000-000000000003', 'Closers: columna created_by en creators', 'Migración para agregar columna created_by a tabla creators', 'done', now(), 102),
('a0000001-0000-0000-0000-000000000003', 'Closers: botón Agregar Creador + KPI filtradas', 'Botón restaurado y KPI cards sin Onboarding para closers', 'done', now(), 103),
('a0000001-0000-0000-0000-000000000003', 'Verificar created_by en conversión a creador', 'handleConvertToCreator debe guardar created_by correctamente', 'todo', null, 110)
ON CONFLICT DO NOTHING;

-- Comunicación / Notificaciones (category: b0000001-0000-0000-0000-000000000010)
INSERT INTO roadmap_items (category_id, task, description, status, completed_at, position) VALUES
('b0000001-0000-0000-0000-000000000010', 'Sonido de notificaciones corregido', 'Integración playNotificationSound en realtime listener con respeto a DND y sound_enabled', 'done', now(), 100),
('b0000001-0000-0000-0000-000000000010', 'Digests (resúmenes) - Edge Function', 'UI existe pero falta Edge Function que envíe los resúmenes', 'todo', null, 110),
('b0000001-0000-0000-0000-000000000010', 'Email channel - validación dominio', 'Pendiente configuración de dominio de email para envío', 'todo', null, 111),
('b0000001-0000-0000-0000-000000000010', 'Google Calendar sync', 'Pendiente credenciales OAuth del cliente', 'todo', null, 112)
ON CONFLICT DO NOTHING;

-- Messenger (category: c0000001-0000-0000-0000-000000000001)
INSERT INTO roadmap_items (category_id, task, description, status, completed_at, position) VALUES
('c0000001-0000-0000-0000-000000000001', 'Testing videollamadas LiveKit', 'UI existe, validar funcionalidad end-to-end', 'todo', null, 110)
ON CONFLICT DO NOTHING;

-- RRHH (category: b0000001-0000-0000-0000-000000000009)
INSERT INTO roadmap_items (category_id, task, description, status, completed_at, position) VALUES
('b0000001-0000-0000-0000-000000000009', 'Edge Function notify-absence', 'Pendiente dominio email para notificaciones de ausencias', 'todo', null, 110)
ON CONFLICT DO NOTHING;

-- Admin (category: a0000001-0000-0000-0000-000000000001)
INSERT INTO roadmap_items (category_id, task, description, status, completed_at, position) VALUES
('a0000001-0000-0000-0000-000000000001', 'Auditoría eventos críticos', 'Verificar que todos los eventos críticos se loguean en audit_log', 'todo', null, 110)
ON CONFLICT DO NOTHING;