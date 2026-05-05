
-- Table: closer_creators
CREATE TABLE public.closer_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_handle text NOT NULL,
  category text,
  passed_date date,
  source_account text,
  phone text,
  notes text,
  onlyfans_url text,
  estimated_monetization numeric(12,2) DEFAULT 0,
  agency_commission numeric(5,2) DEFAULT 0,
  stage text NOT NULL DEFAULT 'Asignada',
  assigned_to uuid REFERENCES auth.users(id),
  rejection_reason text,
  confirmed_date timestamptz,
  completed_date timestamptz,
  last_contact_date timestamptz,
  monthly_monetization numeric(12,2),
  created_by uuid REFERENCES auth.users(id),
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table: closer_contact_history
CREATE TABLE public.closer_contact_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.closer_creators(id) ON DELETE CASCADE,
  contact_date timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL,
  result text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger for closer_creators
CREATE TRIGGER set_closer_creators_updated_at
  BEFORE UPDATE ON public.closer_creators
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: limit contact history to 6 per creator
CREATE OR REPLACE FUNCTION public.limit_closer_contact_history()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  contact_count integer;
BEGIN
  SELECT COUNT(*) INTO contact_count
  FROM public.closer_contact_history
  WHERE creator_id = NEW.creator_id;
  
  IF contact_count >= 6 THEN
    RAISE EXCEPTION 'Maximum of 6 contact history records per creator';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_max_contacts
  BEFORE INSERT ON public.closer_contact_history
  FOR EACH ROW
  EXECUTE FUNCTION public.limit_closer_contact_history();

-- Trigger: auto-update last_contact_date
CREATE OR REPLACE FUNCTION public.update_closer_last_contact()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.closer_creators
  SET last_contact_date = NEW.contact_date
  WHERE id = NEW.creator_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_last_contact
  AFTER INSERT ON public.closer_contact_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_closer_last_contact();

-- RLS for closer_creators
ALTER TABLE public.closer_creators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on closer_creators"
  ON public.closer_creators
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Closers see own assigned creators"
  ON public.closer_creators
  FOR SELECT
  TO authenticated
  USING (assigned_to = auth.uid());

CREATE POLICY "Closers update own assigned creators"
  ON public.closer_creators
  FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

CREATE POLICY "Managers can view all closer_creators"
  ON public.closer_creators
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

-- RLS for closer_contact_history
ALTER TABLE public.closer_contact_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on closer_contact_history"
  ON public.closer_contact_history
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Closers see contact history of own creators"
  ON public.closer_contact_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.closer_creators
      WHERE id = creator_id AND assigned_to = auth.uid()
    )
  );

CREATE POLICY "Closers insert contact history for own creators"
  ON public.closer_contact_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.closer_creators
      WHERE id = creator_id AND assigned_to = auth.uid()
    )
  );

CREATE POLICY "Managers view all contact history"
  ON public.closer_contact_history
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));
