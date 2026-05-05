
-- ============================================================
-- Módulo Proyecto Cuentas Propias (MP) — Tablas nuevas
-- ============================================================

-- Enums
CREATE TYPE public.mp_task_status AS ENUM ('todo', 'in_progress', 'blocked', 'completed');
CREATE TYPE public.mp_task_priority AS ENUM ('high', 'medium', 'low');
CREATE TYPE public.mp_task_pillar AS ENUM ('recruiting', 'ai', 'modelo', 'trafico', 'operaciones', 'general');
CREATE TYPE public.mp_candidate_stage AS ENUM ('candidata', 'contactada', 'entrevista', 'filtro', 'shooting', 'contrato', 'activa', 'inactiva');
CREATE TYPE public.mp_content_type AS ENUM ('ai_social', 'ai_perfil', 'ai_premium', 'modelo_video', 'modelo_custom', 'modelo_intimo');
CREATE TYPE public.mp_content_source AS ENUM ('ai', 'modelo');

-- ── mp_phases ──
CREATE TABLE public.mp_phases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phase_number INT NOT NULL CHECK (phase_number BETWEEN 1 AND 3),
  start_date DATE,
  end_date DATE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_phases" ON public.mp_phases FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── mp_tasks ──
CREATE TABLE public.mp_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  phase_id UUID REFERENCES public.mp_phases(id) ON DELETE SET NULL,
  pillar public.mp_task_pillar NOT NULL DEFAULT 'general',
  status public.mp_task_status NOT NULL DEFAULT 'todo',
  priority public.mp_task_priority NOT NULL DEFAULT 'medium',
  assigned_to UUID,
  due_date DATE,
  position INT NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_tasks" ON public.mp_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── mp_candidates ──
CREATE TABLE public.mp_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  photo_url TEXT,
  city TEXT,
  contact_date DATE,
  notes TEXT,
  stage public.mp_candidate_stage NOT NULL DEFAULT 'candidata',
  estimated_tier TEXT,
  position INT NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_candidates" ON public.mp_candidates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── mp_candidate_checklist ──
CREATE TABLE public.mp_candidate_checklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.mp_candidates(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_candidate_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_candidate_checklist" ON public.mp_candidate_checklist FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── mp_models ──
CREATE TABLE public.mp_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID REFERENCES public.mp_candidates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  account_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_models" ON public.mp_models FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── mp_content_entries ──
CREATE TABLE public.mp_content_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID NOT NULL REFERENCES public.mp_models(id) ON DELETE CASCADE,
  content_type public.mp_content_type NOT NULL,
  source public.mp_content_source NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_content_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_content_entries" ON public.mp_content_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── mp_content_sessions ──
CREATE TABLE public.mp_content_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID NOT NULL REFERENCES public.mp_models(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_content_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_content_sessions" ON public.mp_content_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── mp_traffic_organic ──
CREATE TABLE public.mp_traffic_organic (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID NOT NULL REFERENCES public.mp_models(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  posts_count INT NOT NULL DEFAULT 0,
  engagement NUMERIC,
  clicks INT DEFAULT 0,
  subs_generated INT DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_traffic_organic ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_traffic_organic" ON public.mp_traffic_organic FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── mp_traffic_sfs ──
CREATE TABLE public.mp_traffic_sfs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID NOT NULL REFERENCES public.mp_models(id) ON DELETE CASCADE,
  partner_name TEXT NOT NULL,
  partner_handle TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  result TEXT,
  subs_generated INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_traffic_sfs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_traffic_sfs" ON public.mp_traffic_sfs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── mp_traffic_paid ──
CREATE TABLE public.mp_traffic_paid (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID NOT NULL REFERENCES public.mp_models(id) ON DELETE CASCADE,
  creator_contacted TEXT,
  amount_invested NUMERIC NOT NULL DEFAULT 0,
  subs_obtained INT DEFAULT 0,
  cpa NUMERIC GENERATED ALWAYS AS (CASE WHEN subs_obtained > 0 THEN amount_invested / subs_obtained ELSE NULL END) STORED,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_traffic_paid ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_traffic_paid" ON public.mp_traffic_paid FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── mp_financials ──
CREATE TABLE public.mp_financials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID NOT NULL REFERENCES public.mp_models(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  revenue NUMERIC NOT NULL DEFAULT 0,
  cost_chatters NUMERIC NOT NULL DEFAULT 0,
  cost_content NUMERIC NOT NULL DEFAULT 0,
  cost_traffic NUMERIC NOT NULL DEFAULT 0,
  cost_other NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_financials" ON public.mp_financials FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── mp_team_members ──
CREATE TABLE public.mp_team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  salary NUMERIC,
  start_date DATE,
  status TEXT NOT NULL DEFAULT 'searching' CHECK (status IN ('hired', 'searching', 'pending')),
  accounts_assigned TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_team_members" ON public.mp_team_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── mp_team_plan ──
CREATE TABLE public.mp_team_plan (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month_target INT NOT NULL,
  headcount_target INT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_team_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_team_plan" ON public.mp_team_plan FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── mp_milestones ──
CREATE TABLE public.mp_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  position INT NOT NULL DEFAULT 0,
  phase_id UUID REFERENCES public.mp_phases(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mp_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access on mp_milestones" ON public.mp_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Updated_at triggers ──
CREATE OR REPLACE FUNCTION public.mp_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER mp_phases_updated_at BEFORE UPDATE ON public.mp_phases FOR EACH ROW EXECUTE FUNCTION public.mp_update_updated_at();
CREATE TRIGGER mp_tasks_updated_at BEFORE UPDATE ON public.mp_tasks FOR EACH ROW EXECUTE FUNCTION public.mp_update_updated_at();
CREATE TRIGGER mp_candidates_updated_at BEFORE UPDATE ON public.mp_candidates FOR EACH ROW EXECUTE FUNCTION public.mp_update_updated_at();
CREATE TRIGGER mp_models_updated_at BEFORE UPDATE ON public.mp_models FOR EACH ROW EXECUTE FUNCTION public.mp_update_updated_at();
CREATE TRIGGER mp_financials_updated_at BEFORE UPDATE ON public.mp_financials FOR EACH ROW EXECUTE FUNCTION public.mp_update_updated_at();
CREATE TRIGGER mp_team_members_updated_at BEFORE UPDATE ON public.mp_team_members FOR EACH ROW EXECUTE FUNCTION public.mp_update_updated_at();
CREATE TRIGGER mp_milestones_updated_at BEFORE UPDATE ON public.mp_milestones FOR EACH ROW EXECUTE FUNCTION public.mp_update_updated_at();

-- ── Seed data: 3 Phases ──
INSERT INTO public.mp_phases (name, phase_number, description, status) VALUES
('Fase 1: Setup & Primeras Cuentas', 1, 'Setup operacional, recruiting inicial, equipo AI, primeras 2 cuentas activas', 'active'),
('Fase 2: Escalar a 5 Cuentas', 2, 'Escalar recruiting, optimizar contenido AI, agregar tráfico pagado, 5 cuentas activas', 'planned'),
('Fase 3: 10 Cuentas + Rentabilidad', 3, 'Operación optimizada, 10 cuentas activas, breakeven y rentabilidad', 'planned');

-- ── Seed data: Milestones ──
INSERT INTO public.mp_milestones (title, description, position, phase_id) VALUES
('Primera modelo contratada', 'Firmar contrato con la primera modelo', 1, (SELECT id FROM public.mp_phases WHERE phase_number = 1)),
('Equipo AI operativo', 'Pipeline de generación de contenido AI funcionando', 2, (SELECT id FROM public.mp_phases WHERE phase_number = 1)),
('2 cuentas activas', 'Tener 2 cuentas generando revenue', 3, (SELECT id FROM public.mp_phases WHERE phase_number = 1)),
('5 cuentas activas', 'Escalar a 5 cuentas con chatters asignados', 4, (SELECT id FROM public.mp_phases WHERE phase_number = 2)),
('Primer mes breakeven', 'Revenue >= Costos por primera vez', 5, (SELECT id FROM public.mp_phases WHERE phase_number = 2)),
('10 cuentas activas', 'Llegar a 10 cuentas operando simultáneamente', 6, (SELECT id FROM public.mp_phases WHERE phase_number = 3)),
('Rentabilidad sostenida', '3 meses consecutivos con profit positivo', 7, (SELECT id FROM public.mp_phases WHERE phase_number = 3));

-- ── Permission for admin role ──
INSERT INTO public.role_permissions (role_id, module, can_access, data_scope)
SELECT rc.id, 'ProyectoMP', true, 'all'
FROM public.roles_config rc
WHERE rc.name = 'admin' AND rc.is_active = true
ON CONFLICT DO NOTHING;
