
-- Create roadmap_categories table
CREATE TABLE public.roadmap_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roadmap_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to roadmap_categories"
  ON public.roadmap_categories FOR ALL
  USING (true) WITH CHECK (true);

-- Create roadmap_items table
CREATE TABLE public.roadmap_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES public.roadmap_categories(id) ON DELETE CASCADE,
  submodule text,
  task text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo',
  delivery_date date,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to roadmap_items"
  ON public.roadmap_items FOR ALL
  USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_roadmap_items_updated_at
  BEFORE UPDATE ON public.roadmap_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed data: categories
INSERT INTO public.roadmap_categories (id, name, position) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Core Platform & Auth', 1),
  ('a0000001-0000-0000-0000-000000000002', 'Gestión de Contactos', 2),
  ('a0000001-0000-0000-0000-000000000003', 'Gestión de Creadoras', 3),
  ('a0000001-0000-0000-0000-000000000004', 'Eventos', 4),
  ('a0000001-0000-0000-0000-000000000005', 'Operaciones', 5),
  ('a0000001-0000-0000-0000-000000000006', 'Sales & Analytics', 6),
  ('a0000001-0000-0000-0000-000000000007', 'Recursos & Admin', 7),
  ('a0000001-0000-0000-0000-000000000008', 'Módulos Pendientes', 8);

-- Seed data: items
INSERT INTO public.roadmap_items (category_id, submodule, task, status, position) VALUES
  -- Core Platform & Auth
  ('a0000001-0000-0000-0000-000000000001', 'Auth', 'Login / Register / Forgot Password', 'done', 1),
  ('a0000001-0000-0000-0000-000000000001', 'Auth', 'Roles y permisos (Admin/Manager/Employee)', 'done', 2),
  ('a0000001-0000-0000-0000-000000000001', 'Dashboard', 'Dashboard principal con métricas', 'done', 3),
  ('a0000001-0000-0000-0000-000000000001', 'Layout', 'Sidebar colapsable + Topbar + Theme', 'done', 4),
  ('a0000001-0000-0000-0000-000000000001', 'Layout', 'Búsqueda global (Cmd+K)', 'done', 5),
  ('a0000001-0000-0000-0000-000000000001', 'i18n', 'Soporte multilenguaje (ES/EN)', 'done', 6),
  -- Contactos
  ('a0000001-0000-0000-0000-000000000002', 'Contactos', 'CRUD de contactos', 'done', 1),
  ('a0000001-0000-0000-0000-000000000002', 'Contactos', 'Filtros y búsqueda', 'done', 2),
  ('a0000001-0000-0000-0000-000000000002', 'Agencias', 'CRUD de agencias', 'done', 3),
  -- Creadoras
  ('a0000001-0000-0000-0000-000000000003', 'Creadoras', 'CRUD y perfil completo', 'done', 1),
  ('a0000001-0000-0000-0000-000000000003', 'Creadoras', 'Tabs: Info, Redes, Monetización, Notas, Docs', 'done', 2),
  ('a0000001-0000-0000-0000-000000000003', 'Creadoras', 'Lineamientos y guidelines', 'done', 3),
  ('a0000001-0000-0000-0000-000000000003', 'Creadoras', 'Historial y tickets por creadora', 'done', 4),
  ('a0000001-0000-0000-0000-000000000003', 'Onboarding', 'Flujo de onboarding de modelos', 'todo', 5),
  ('a0000001-0000-0000-0000-000000000003', 'Contenido', 'Gestión de contenido personalizado', 'todo', 6),
  -- Eventos
  ('a0000001-0000-0000-0000-000000000004', 'Eventos', 'CRUD y detalle de eventos', 'done', 1),
  ('a0000001-0000-0000-0000-000000000004', 'Eventos', 'Invitados, checklist, métricas', 'done', 2),
  ('a0000001-0000-0000-0000-000000000004', 'Eventos', 'Calendario y compartir externo', 'done', 3),
  -- Operaciones
  ('a0000001-0000-0000-0000-000000000005', 'Promolog', 'Registro y filtros de promos', 'done', 1),
  ('a0000001-0000-0000-0000-000000000005', 'LeadGen', 'Pipeline de leads', 'done', 2),
  ('a0000001-0000-0000-0000-000000000005', 'Closers', 'Gestión de deals', 'done', 3),
  ('a0000001-0000-0000-0000-000000000005', 'Tickets', 'Sistema de tickets', 'done', 4),
  ('a0000001-0000-0000-0000-000000000005', 'Tareas', 'Proyectos, tareas, subtareas', 'done', 5),
  -- Sales
  ('a0000001-0000-0000-0000-000000000006', 'Sales Overview', 'Dashboard de ventas general', 'done', 1),
  ('a0000001-0000-0000-0000-000000000006', 'Sales Dashboard', 'Reporte de ventas por creadora', 'done', 2),
  ('a0000001-0000-0000-0000-000000000006', 'Sales Performance', 'Performance v1 por creadora', 'done', 3),
  ('a0000001-0000-0000-0000-000000000006', 'AI Sales', 'Chat de ventas con IA', 'done', 4),
  ('a0000001-0000-0000-0000-000000000006', 'Comparativas', 'Comparativas y ranking', 'done', 5),
  -- Recursos & Admin
  ('a0000001-0000-0000-0000-000000000007', 'Design System', 'Página de design system', 'done', 1),
  ('a0000001-0000-0000-0000-000000000007', 'Docs', 'Documentación técnica', 'done', 2),
  ('a0000001-0000-0000-0000-000000000007', 'Admin', 'Gestión de usuarios y roles', 'done', 3),
  ('a0000001-0000-0000-0000-000000000007', 'Admin', 'Auditoría de roles', 'done', 4),
  ('a0000001-0000-0000-0000-000000000007', 'Roadmap', 'Tracker de progreso de plataforma', 'done', 5),
  -- Pendientes
  ('a0000001-0000-0000-0000-000000000008', 'RRHH', 'Módulo de Recursos Humanos', 'todo', 1),
  ('a0000001-0000-0000-0000-000000000008', 'Contabilidad', 'Módulo de Contabilidad', 'todo', 2),
  ('a0000001-0000-0000-0000-000000000008', 'RRHH', 'Nómina y pagos de personal', 'todo', 3),
  ('a0000001-0000-0000-0000-000000000008', 'Contabilidad', 'Reportes financieros', 'todo', 4);
