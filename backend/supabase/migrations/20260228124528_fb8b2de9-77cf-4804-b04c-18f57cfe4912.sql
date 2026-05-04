
CREATE TABLE public.custom_content_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES public.creators(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL DEFAULT 'otro',
  status TEXT NOT NULL DEFAULT 'pendiente',
  priority TEXT NOT NULL DEFAULT 'normal',
  requested_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_content_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all requests"
  ON public.custom_content_requests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert requests"
  ON public.custom_content_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update requests"
  ON public.custom_content_requests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete requests"
  ON public.custom_content_requests FOR DELETE
  TO authenticated
  USING (true);

CREATE TRIGGER update_custom_content_requests_updated_at
  BEFORE UPDATE ON public.custom_content_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
