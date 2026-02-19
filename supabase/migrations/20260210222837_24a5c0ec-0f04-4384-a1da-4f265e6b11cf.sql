
-- Create updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create events table
CREATE TABLE public.events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  event_type text NOT NULL,
  description text,
  date date NOT NULL,
  end_date date,
  start_time time,
  end_time time,
  location text,
  max_capacity integer,
  status text NOT NULL DEFAULT 'upcoming',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create event_guests table
CREATE TABLE public.event_guests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  creator_id uuid REFERENCES public.creators(id),
  guest_name text,
  guest_type text NOT NULL DEFAULT 'creator',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_guests ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (no auth)
CREATE POLICY "Allow all access to events" ON public.events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to event_guests" ON public.event_guests FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
