-- Table for invoice templates
CREATE TABLE public.invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'invoice',
  company_name TEXT,
  company_address TEXT,
  company_email TEXT,
  logo_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view templates"
  ON public.invoice_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert templates"
  ON public.invoice_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update templates"
  ON public.invoice_templates FOR UPDATE TO authenticated USING (true);

-- Storage bucket for template logos
INSERT INTO storage.buckets (id, name, public) VALUES ('template-logos', 'template-logos', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view template logos" ON storage.objects;
CREATE POLICY "Anyone can view template logos"
  ON storage.objects FOR SELECT USING (bucket_id = 'template-logos');
DROP POLICY IF EXISTS "Authenticated can upload template logos" ON storage.objects;
CREATE POLICY "Authenticated can upload template logos"
  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'template-logos');
DROP POLICY IF EXISTS "Authenticated can update template logos" ON storage.objects;
CREATE POLICY "Authenticated can update template logos"
  ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'template-logos');