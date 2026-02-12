
-- Create leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url_perfil TEXT NOT NULL,
  plataforma TEXT NOT NULL,
  categoria TEXT NOT NULL,
  compania TEXT NOT NULL,
  pais TEXT,
  notas TEXT,
  evidence_urls TEXT[],
  status TEXT NOT NULL DEFAULT 'nuevo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to leads"
  ON public.leads FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create contactos table
CREATE TABLE public.contactos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  instagram TEXT NOT NULL,
  categoria_fisica TEXT,
  compania TEXT,
  email TEXT,
  country_code TEXT DEFAULT '+57',
  telefono TEXT,
  ticket TEXT,
  notas TEXT,
  profile_photo_url TEXT,
  estado TEXT NOT NULL DEFAULT 'Nuevo',
  pais TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contactos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to contactos"
  ON public.contactos FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_contactos_updated_at
  BEFORE UPDATE ON public.contactos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
