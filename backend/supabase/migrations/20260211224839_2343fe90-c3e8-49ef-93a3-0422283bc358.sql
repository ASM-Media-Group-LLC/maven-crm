
-- Extender event_guests
ALTER TABLE event_guests
  ADD COLUMN email text,
  ADD COLUMN phone text,
  ADD COLUMN cancellation_reason text,
  ADD COLUMN status_updated_at timestamptz DEFAULT now(),
  ADD COLUMN status_changed_by text;

-- Unique constraint para evitar duplicados
CREATE UNIQUE INDEX idx_event_guests_creator 
  ON event_guests(event_id, creator_id) WHERE creator_id IS NOT NULL;
CREATE UNIQUE INDEX idx_event_guests_external 
  ON event_guests(event_id, guest_name, guest_type) WHERE creator_id IS NULL;

-- Extender events con tokens
ALTER TABLE events
  ADD COLUMN internal_token text UNIQUE DEFAULT gen_random_uuid()::text,
  ADD COLUMN external_token text UNIQUE DEFAULT gen_random_uuid()::text,
  ADD COLUMN external_link_expires_at timestamptz;

-- Tabla de log de asistencia
CREATE TABLE public.event_attendance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_guest_id uuid NOT NULL REFERENCES event_guests(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by text,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.event_attendance_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to event_attendance_log" 
  ON public.event_attendance_log FOR ALL USING (true) WITH CHECK (true);

-- Tabla de checklist
CREATE TABLE public.event_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  assigned_to text,
  notes text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.event_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to event_checklist_items" 
  ON public.event_checklist_items FOR ALL USING (true) WITH CHECK (true);

-- Trigger para log automatico de cambios de estado
CREATE OR REPLACE FUNCTION public.log_guest_status_change()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO event_attendance_log (event_guest_id, event_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NEW.event_id, OLD.status, NEW.status, NEW.status_changed_by);
    NEW.status_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guest_status_change
  BEFORE UPDATE ON event_guests
  FOR EACH ROW EXECUTE FUNCTION public.log_guest_status_change();
