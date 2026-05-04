-- Table to log category changes on closers_contacts
CREATE TABLE public.contact_category_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  contact_name text NOT NULL,
  contact_handle text NOT NULL,
  old_category text,
  new_category text,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  contact_created_at timestamptz,
  hours_since_creation double precision
);

ALTER TABLE public.contact_category_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view category changes"
  ON public.contact_category_changes
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert category changes"
  ON public.contact_category_changes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_contact_category_changes_contact ON public.contact_category_changes(contact_id);
CREATE INDEX idx_contact_category_changes_changed_at ON public.contact_category_changes(changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_contact_category_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hours_diff double precision;
BEGIN
  IF OLD.physical_appearance IS DISTINCT FROM NEW.physical_appearance THEN
    hours_diff := EXTRACT(EPOCH FROM (now() - COALESCE(OLD.created_at, now()))) / 3600.0;
    
    INSERT INTO public.contact_category_changes (
      contact_id, contact_name, contact_handle,
      old_category, new_category, changed_by,
      contact_created_at, hours_since_creation
    ) VALUES (
      NEW.id, NEW.name, NEW.handle,
      OLD.physical_appearance, NEW.physical_appearance,
      auth.uid(),
      OLD.created_at, hours_diff
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_contact_category_change
  BEFORE UPDATE ON public.closers_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.log_contact_category_change();